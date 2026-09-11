import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  createBillingPortalSession,
  createCheckoutSession,
  requireSessionUser,
} from "@/lib/billing/checkout";
import { PLANS, type PlanId, formatUsd } from "@/lib/billing/plans";
import { stripeConfigured } from "@/lib/billing/stripe";
import { getEntitlement } from "@/lib/billing/usage";

const PlanIdSchema = z.enum(["song", "basic", "plus", "pro"]);

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
    return { entitlement, stripeReady: stripeConfigured() };
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
