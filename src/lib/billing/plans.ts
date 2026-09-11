/**
 * After Hours pricing — retail prices with remix/mash caps.
 *
 * Internal AI cost budget is ~30% of subscription price. Caps are sized so
 * (remixesPerMonth × COST_PER_REMIX_CENTS) stays within that budget.
 *
 *   Free         $0      → 1 remix / calendar month
 *   Single mix   $2.99   → 1 mix credit (one-time)
 *   Basic        $9.99   → 16 / month → 4 / week (resets each week)
 *   Plus        $19.99   → 32 / month → 8 / week
 *   Pro         $29.99   → 48 / month → 12 / week
 *
 * At ~19¢ internal cost per AI remix: Basic 16×19¢=$3.04, Plus $6.08, Pro $9.12.
 */

export type PlanId = "song" | "basic" | "plus" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  blurb: string;
  priceCents: number;
  kind: "one_time" | "subscription";
  /** Monthly AI cost ceiling (cents). ~30% of subscription retail. */
  usageBudgetCents: number;
  /** Song/mix credits granted on purchase. Only for one-time song. */
  songCredits: number;
  /** Total AI remixes included per billing month (subs). */
  remixesPerMonth: number;
  /** Weekly batch that resets each week (subs). Null for one-time. */
  remixesPerWeek: number | null;
  /** Env var holding the Stripe Price id after `npm run stripe:setup`. */
  stripePriceEnv: string;
};

/** ~30%-of-revenue unit cost used to size remix caps. */
export const COST_PER_REMIX_CENTS = 19;

/** Signed-in users with no plan get this many AI remixes per calendar month. */
export const FREE_REMIXES_PER_MONTH = 1;

export const PLANS: Record<PlanId, Plan> = {
  song: {
    id: "song",
    name: "Single mix",
    blurb: "One AI mash or remix — pay as you go.",
    priceCents: 299,
    kind: "one_time",
    usageBudgetCents: 0,
    songCredits: 1,
    remixesPerMonth: 1,
    remixesPerWeek: null,
    stripePriceEnv: "STRIPE_PRICE_SONG",
  },
  basic: {
    id: "basic",
    name: "Basic",
    blurb: "4 AI remixes each week (16 / month). Resets weekly.",
    priceCents: 999,
    kind: "subscription",
    usageBudgetCents: 300,
    songCredits: 0,
    remixesPerMonth: 16,
    remixesPerWeek: 4,
    stripePriceEnv: "STRIPE_PRICE_BASIC",
  },
  plus: {
    id: "plus",
    name: "Plus",
    blurb: "8 AI remixes each week (32 / month). Resets weekly.",
    priceCents: 1999,
    kind: "subscription",
    usageBudgetCents: 600,
    songCredits: 0,
    remixesPerMonth: 32,
    remixesPerWeek: 8,
    stripePriceEnv: "STRIPE_PRICE_PLUS",
  },
  pro: {
    id: "pro",
    name: "Pro",
    blurb: "12 AI remixes each week (48 / month). Resets weekly.",
    priceCents: 2999,
    kind: "subscription",
    usageBudgetCents: 900,
    songCredits: 0,
    remixesPerMonth: 48,
    remixesPerWeek: 12,
    stripePriceEnv: "STRIPE_PRICE_PRO",
  },
};

export const SUBSCRIPTION_PLAN_IDS = [
  "basic",
  "plus",
  "pro",
] as const satisfies readonly PlanId[];

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

/** Assert subscription remix caps stay inside the ~30% cost budget. */
export function remixCapWithinBudget(plan: Plan): boolean {
  if (plan.kind !== "subscription") return true;
  return plan.remixesPerMonth * COST_PER_REMIX_CENTS <= plan.usageBudgetCents + 20;
}
