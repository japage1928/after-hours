/**
 * After Hours pricing — fixed retail prices; usage budget is 30% of sub price
 * so AI spend stays under the product margin target.
 *
 *   Single song  $2.99  → one song credit (à la carte)
 *   Basic        $9.99  → $3.00 usage / billing period
 *   Plus        $19.99  → $6.00 usage / billing period
 *   Pro         $29.99  → $9.00 usage / billing period
 */

export type PlanId = "song" | "basic" | "plus" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  blurb: string;
  priceCents: number;
  kind: "one_time" | "subscription";
  /** Monthly AI usage budget (cents). Only for subscriptions. */
  usageBudgetCents: number;
  /** Song credits granted on purchase. Only for one-time song. */
  songCredits: number;
  /** Env var holding the Stripe Price id after `npm run stripe:setup`. */
  stripePriceEnv: string;
};

export const PLANS: Record<PlanId, Plan> = {
  song: {
    id: "song",
    name: "Single song",
    blurb: "One Write-tab song when you need it.",
    priceCents: 299,
    kind: "one_time",
    usageBudgetCents: 0,
    songCredits: 1,
    stripePriceEnv: "STRIPE_PRICE_SONG",
  },
  basic: {
    id: "basic",
    name: "Basic",
    blurb: "Starter monthly booth. Usage capped at $3.",
    priceCents: 999,
    kind: "subscription",
    usageBudgetCents: 300,
    songCredits: 0,
    stripePriceEnv: "STRIPE_PRICE_BASIC",
  },
  plus: {
    id: "plus",
    name: "Plus",
    blurb: "More room to write. Usage capped at $6.",
    priceCents: 1999,
    kind: "subscription",
    usageBudgetCents: 600,
    songCredits: 0,
    stripePriceEnv: "STRIPE_PRICE_PLUS",
  },
  pro: {
    id: "pro",
    name: "Pro",
    blurb: "Full late-night run. Usage capped at $9.",
    priceCents: 2999,
    kind: "subscription",
    usageBudgetCents: 900,
    songCredits: 0,
    stripePriceEnv: "STRIPE_PRICE_PRO",
  },
};

export const SUBSCRIPTION_PLAN_IDS = ["basic", "plus", "pro"] as const satisfies readonly PlanId[];

export function planById(id: string | null | undefined): Plan | null {
  if (!id) return null;
  return PLANS[id as PlanId] ?? null;
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Resolve Stripe Price id from env for a plan. */
export function stripePriceIdForPlan(
  planId: PlanId,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
  const plan = PLANS[planId];
  const value = env[plan.stripePriceEnv]?.trim();
  return value || null;
}

export function planIdFromStripePrice(
  priceId: string | null | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): PlanId | null {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) {
    if (env[plan.stripePriceEnv]?.trim() === priceId) return plan.id;
  }
  return null;
}
