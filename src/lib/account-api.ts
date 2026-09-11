import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { getActiveSubscription } from "@/lib/billing/usage";

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update "user"
      set "name" = ${data.name},
          "updatedAt" = CURRENT_TIMESTAMP
      where "id" = ${context.userId}
    `;
    return { ok: true as const, name: data.name };
  });

export const listMyAuthProviders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ providerId: string; createdAt: Date | string }>`
      select "providerId", "createdAt"
      from "account"
      where "userId" = ${context.userId}
      order by "createdAt" asc
    `;
    return {
      providers: rows.map((r) => ({
        providerId: r.providerId,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
      })),
    };
  });

/**
 * Permanently delete the signed-in user.
 * Cancels any active Stripe subscription first, then removes the user row
 * (sessions, accounts, billing cascade via FK).
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        confirmation: z.literal("DELETE"),
      })
      .parse(input),
  )
  .handler(async ({ context }) => {
    const sql = await getSql();

    if (stripeConfigured()) {
      const sub = await getActiveSubscription(context.userId);
      if (sub) {
        try {
          await getStripe().subscriptions.cancel(sub.id);
        } catch {
          /* still delete the account if Stripe cancel fails */
        }
      }
      const customers = await sql<{ stripe_customer_id: string }>`
        select stripe_customer_id from billing_customer
        where user_id = ${context.userId}
      `;
      const customerId = customers[0]?.stripe_customer_id;
      if (customerId) {
        try {
          await getStripe().customers.del(customerId);
        } catch {
          /* ignore — local row will cascade */
        }
      }
    }

    await sql`delete from "user" where "id" = ${context.userId}`;
    return { ok: true as const };
  });
