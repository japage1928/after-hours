import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { adminEmails, isAdminEmail } from "@/lib/auth/admin";
import { auth } from "@/lib/auth/server";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { upsertSubscriptionFromStripe } from "@/lib/billing/checkout";
import { formatUsd } from "@/lib/billing/plans";
import {
  grantSongCredits,
  grantUsageCredit,
  newId,
} from "@/lib/billing/usage";
import { getSql } from "@/lib/db";

async function requireAdminSession() {
  const request = getRequest();
  if (!request) throw new Error("Forbidden");
  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user?.email ?? null;
  if (!session?.user || !isAdminEmail(email)) {
    throw new Error("Forbidden");
  }
  return session.user;
}

async function audit(
  adminUserId: string,
  action: string,
  targetUserId: string | null,
  detail: Record<string, unknown>,
) {
  const sql = await getSql();
  await sql`
    insert into admin_audit (id, admin_user_id, action, target_user_id, detail_json)
    values (
      ${newId("aud")},
      ${adminUserId},
      ${action},
      ${targetUserId},
      ${JSON.stringify(detail)}
    )
  `;
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  isAdmin: boolean;
  planId: string | null;
  subStatus: string | null;
  usageUsedCents: number;
  usageBudgetCents: number;
  songCredits: number;
};

export const getAdminBootstrap = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireAdminSession();
    const sql = await getSql();
    const [users, stuck, activeSubs] = await Promise.all([
      sql<{ n: number }>`select count(*)::int as n from "user"`,
      sql<{ n: number }>`
        select count(*)::int as n from billing_payment
        where status in ('open', 'failed', 'processing', 'requires_action')
      `,
      sql<{ n: number }>`
        select count(*)::int as n from billing_subscription
        where status in ('active', 'trialing', 'past_due')
      `,
    ]);
    return {
      email: user.email,
      name: user.name,
      admins: adminEmails(),
      stripeReady: stripeConfigured(),
      stats: {
        users: Number(users[0]?.n ?? 0),
        stuckPayments: Number(stuck[0]?.n ?? 0),
        activeSubs: Number(activeSubs[0]?.n ?? 0),
      },
    };
  },
);

export const listAdminUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminUserRow[]> => {
    await requireAdminSession();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      email: string;
      emailVerified: boolean;
      createdAt: Date | string;
      plan_id: string | null;
      sub_status: string | null;
      usage_budget_cents: number | null;
      usage_used_cents: number | null;
      song_credits: number | null;
    }>`
      select u.id, u.name, u.email, u."emailVerified", u."createdAt",
             s.plan_id, s.status as sub_status, s.usage_budget_cents,
             coalesce(usage.used, 0)::int as usage_used_cents,
             coalesce(credits.total, 0)::int as song_credits
      from "user" u
      left join lateral (
        select plan_id, status, usage_budget_cents,
               current_period_start, current_period_end
        from billing_subscription bs
        where bs.user_id = u.id
          and bs.status in ('active', 'trialing', 'past_due')
        order by bs.updated_at desc
        limit 1
      ) s on true
      left join lateral (
        select coalesce(sum(amount_cents), 0)::int as used
        from usage_ledger ul
        where ul.user_id = u.id
          and s.current_period_start is not null
          and ul.period_start = s.current_period_start
          and ul.period_end = s.current_period_end
      ) usage on true
      left join lateral (
        select coalesce(sum(remaining), 0)::int as total
        from song_credit sc
        where sc.user_id = u.id and sc.remaining > 0
      ) credits on true
      order by u."createdAt" desc
      limit 200
    `;
    const admins = new Set(adminEmails());
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      emailVerified: Boolean(r.emailVerified),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
      isAdmin: admins.has(r.email.trim().toLowerCase()),
      planId: r.plan_id,
      subStatus: r.sub_status,
      usageUsedCents: Math.max(0, Number(r.usage_used_cents ?? 0)),
      usageBudgetCents: Number(r.usage_budget_cents ?? 0),
      songCredits: Number(r.song_credits ?? 0),
    }));
  },
);

export const listStuckPayments = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdminSession();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      user_id: string | null;
      email: string | null;
      kind: string;
      status: string;
      plan_id: string | null;
      amount_cents: number;
      failure_message: string | null;
      stripe_checkout_session_id: string | null;
      stripe_payment_intent_id: string | null;
      stripe_invoice_id: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>`
      select p.*, u.email
      from billing_payment p
      left join "user" u on u.id = p.user_id
      where p.status in ('open', 'failed', 'processing', 'requires_action')
      order by p.updated_at desc
      limit 100
    `;
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: r.email,
      kind: r.kind,
      status: r.status,
      planId: r.plan_id,
      amountCents: r.amount_cents,
      amountLabel: formatUsd(r.amount_cents),
      failureMessage: r.failure_message,
      checkoutSessionId: r.stripe_checkout_session_id,
      paymentIntentId: r.stripe_payment_intent_id,
      invoiceId: r.stripe_invoice_id,
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
      updatedAt:
        r.updated_at instanceof Date
          ? r.updated_at.toISOString()
          : String(r.updated_at),
    }));
  },
);

export const listSubscriptions = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdminSession();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      user_id: string;
      email: string | null;
      plan_id: string;
      status: string;
      usage_budget_cents: number;
      current_period_end: Date | string | null;
      cancel_at_period_end: boolean;
      updated_at: Date | string;
    }>`
      select s.*, u.email
      from billing_subscription s
      left join "user" u on u.id = s.user_id
      order by s.updated_at desc
      limit 200
    `;
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: r.email,
      planId: r.plan_id,
      status: r.status,
      usageBudgetLabel: formatUsd(r.usage_budget_cents),
      periodEnd:
        r.current_period_end instanceof Date
          ? r.current_period_end.toISOString()
          : r.current_period_end
            ? String(r.current_period_end)
            : null,
      cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
      updatedAt:
        r.updated_at instanceof Date
          ? r.updated_at.toISOString()
          : String(r.updated_at),
    }));
  },
);

export const adminSetPassword = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        userId: z.string().min(1),
        password: z.string().min(8).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const sql = await getSql();
    const hashed = await hashPassword(data.password);
    const accounts = await sql<{ id: string }>`
      select id from account
      where "userId" = ${data.userId} and "providerId" = 'credential'
      limit 1
    `;
    if (accounts[0]) {
      await sql`
        update account set password = ${hashed}, "updatedAt" = CURRENT_TIMESTAMP
        where id = ${accounts[0].id}
      `;
    } else {
      await sql`
        insert into account (
          id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
        ) values (
          ${newId("acc")},
          ${data.userId},
          ${"credential"},
          ${data.userId},
          ${hashed},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `;
    }
    await audit(admin.id, "set_password", data.userId, { via: "admin" });
    return { ok: true as const };
  });

export const adminRequestPasswordReset = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ email: z.string().email() }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    try {
      await auth.api.requestPasswordReset({
        body: {
          email: data.email,
          redirectTo: "/login",
        },
      });
    } catch {
      // Better Auth may not have email delivery configured — still audit.
    }
    await audit(admin.id, "request_password_reset", null, {
      email: data.email,
    });
    return {
      ok: true as const,
      note: "Reset requested. If email delivery is not configured, set a password directly instead.",
    };
  });

export const adminGrantSongCredits = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        userId: z.string().min(1),
        count: z.number().int().min(1).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    await grantSongCredits({
      userId: data.userId,
      count: data.count,
      source: "admin",
    });
    await audit(admin.id, "grant_song_credits", data.userId, {
      count: data.count,
    });
    return { ok: true as const };
  });

export const adminGrantUsage = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        userId: z.string().min(1),
        amountCents: z.number().int().min(1).max(50_000),
        note: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    await grantUsageCredit({
      userId: data.userId,
      amountCents: data.amountCents,
      description: data.note || "Admin usage credit",
      adminUserId: admin.id,
    });
    await audit(admin.id, "grant_usage", data.userId, {
      amountCents: data.amountCents,
    });
    return { ok: true as const };
  });

export const adminResolvePayment = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        paymentId: z.string().min(1),
        status: z.enum(["complete", "expired", "failed", "open"]),
        note: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const sql = await getSql();
    await sql`
      update billing_payment set
        status = ${data.status},
        failure_message = ${data.note ?? null},
        updated_at = CURRENT_TIMESTAMP
      where id = ${data.paymentId}
    `;
    await audit(admin.id, "resolve_payment", null, {
      paymentId: data.paymentId,
      status: data.status,
      note: data.note ?? null,
    });
    return { ok: true as const };
  });

export const adminSyncSubscription = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ subscriptionId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    if (!stripeConfigured()) throw new Error("Stripe is not configured");
    const sub = await getStripe().subscriptions.retrieve(data.subscriptionId);
    const result = await upsertSubscriptionFromStripe(sub as never);
    await audit(admin.id, "sync_subscription", result.userId, {
      subscriptionId: data.subscriptionId,
      planId: result.planId,
    });
    return { ok: true as const, ...result };
  });

export const adminCancelSubscription = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        subscriptionId: z.string().min(1),
        immediately: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    if (!stripeConfigured()) throw new Error("Stripe is not configured");
    const stripe = getStripe();
    const sub = data.immediately
      ? await stripe.subscriptions.cancel(data.subscriptionId)
      : await stripe.subscriptions.update(data.subscriptionId, {
          cancel_at_period_end: true,
        });
    const result = await upsertSubscriptionFromStripe(sub as never);
    await audit(admin.id, "cancel_subscription", result.userId, {
      subscriptionId: data.subscriptionId,
      immediately: Boolean(data.immediately),
    });
    return { ok: true as const };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ userId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    if (data.userId === admin.id) {
      throw new Error("Cannot delete your own admin account");
    }
    const sql = await getSql();
    await sql`delete from "user" where id = ${data.userId}`;
    await audit(admin.id, "delete_user", data.userId, {});
    return { ok: true as const };
  });
