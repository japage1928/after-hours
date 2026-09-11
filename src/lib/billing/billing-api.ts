import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  cancelSubscriptionForUser,
  createBillingPortalSession,
  createCheckoutSession,
  requireSessionUser,
  resumeSubscriptionForUser,
} from "@/lib/billing/checkout";
import { PLANS, type PlanId, formatUsd } from "@/lib/billing/plans";
import { stripeConfigured } from "@/lib/billing/stripe";
import {
  getActiveSubscription,
  getEntitlement,
} from "@/lib/billing/usage";

const PlanIdSchema = z.enum(["song", "basic", "plus", "pro"]);

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export const getBillingCatalog = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      stripeReady: stripeConfigured(),
      plans: Object.values(PLANS).map((p) => ({
        id: p.id,
        name: p.name,
        blurb: p.blurb,
        priceCents: p.priceCents,
        priceLabel: formatUsd(p.priceCents),
        kind: p.kind,
        usageBudgetCents: p.usageBudgetCents,
        usageBudgetLabel: p.usageBudgetCents
          ? formatUsd(p.usageBudgetCents)
          : null,
        songCredits: p.songCredits,
      })),
    };
  },
);

export const getMyBilling = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const entitlement = await getEntitlement(context.userId);
    const sub = await getActiveSubscription(context.userId);
    const plan = sub ? PLANS[sub.plan_id as PlanId] : null;
    return {
      entitlement,
      stripeReady: stripeConfigured(),
      subscription: sub
        ? {
            id: sub.id,
            planId: sub.plan_id,
            planName: plan?.name ?? sub.plan_id,
            status: sub.status,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            periodStart: iso(sub.current_period_start),
            periodEnd: iso(sub.current_period_end),
            priceLabel: plan ? formatUsd(plan.priceCents) : null,
          }
        : null,
    };
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ planId: PlanIdSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const user = await requireSessionUser();
    return createCheckoutSession({
      user: { id: user.id, email: user.email, name: user.name },
      planId: data.planId as PlanId,
    });
  });

export const startBillingPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const user = await requireSessionUser();
    return createBillingPortalSession({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  });

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ immediately: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    if (!stripeConfigured()) throw new Error("Stripe is not configured");
    return cancelSubscriptionForUser(context.userId, {
      immediately: data.immediately,
    });
  });

export const resumeMySubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!stripeConfigured()) throw new Error("Stripe is not configured");
    return resumeSubscriptionForUser(context.userId);
  });
