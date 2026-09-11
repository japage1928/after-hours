import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  COST_PER_REMIX_CENTS,
  FREE_REMIXES_PER_MONTH,
  PLANS,
  planById,
  type PlanId,
  SUBSCRIPTION_PLAN_IDS,
} from "@/lib/billing/plans";
import {
  currentMonthWindow,
  currentWeekWindow,
} from "@/lib/billing/quota-windows";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export type Entitlement = {
  ok: boolean;
  reason?: string;
  source?: "free" | "song_credit" | "subscription" | "admin";
  planId?: PlanId | "free" | null;
  usageUsedCents: number;
  usageBudgetCents: number;
  songCredits: number;
  /** Remixes used in the active free-month or paid-week window. */
  remixesUsed: number;
  /** Cap for that window (1 free / month, or weekly batch for subs). */
  remixesLimit: number;
  /** "month" for free tier, "week" for subscriptions. */
  remixPeriod: "month" | "week" | "credit" | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export async function getActiveSubscription(userId: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    plan_id: string;
    status: string;
    usage_budget_cents: number;
    current_period_start: Date | string | null;
    current_period_end: Date | string | null;
    cancel_at_period_end: boolean;
  }>`
    select id, plan_id, status, usage_budget_cents,
           current_period_start, current_period_end, cancel_at_period_end
    from billing_subscription
    where user_id = ${userId}
      and status in ('active', 'trialing', 'past_due')
    order by
      case when status = 'active' then 0
           when status = 'trialing' then 1
           else 2 end,
      updated_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

export async function countSongCredits(userId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ total: number }>`
    select coalesce(sum(remaining), 0)::int as total
    from song_credit
    where user_id = ${userId} and remaining > 0
  `;
  return Number(rows[0]?.total ?? 0);
}

export async function sumUsageCents(
  userId: string,
  periodStart: Date | string | null,
  periodEnd: Date | string | null,
): Promise<number> {
  if (!periodStart || !periodEnd) return 0;
  const sql = await getSql();
  const rows = await sql<{ total: number }>`
    select coalesce(sum(amount_cents), 0)::int as total
    from usage_ledger
    where user_id = ${userId}
      and period_start = ${periodStart}
      and period_end = ${periodEnd}
      and amount_cents > 0
  `;
  return Math.max(0, Number(rows[0]?.total ?? 0));
}

export async function countRemixesInRange(
  userId: string,
  start: Date,
  end: Date,
): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ total: number }>`
    select coalesce(count(*), 0)::int as total
    from usage_ledger
    where user_id = ${userId}
      and kind in ('mix_plan', 'remix')
      and created_at >= ${start}
      and created_at < ${end}
  `;
  return Math.max(0, Number(rows[0]?.total ?? 0));
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const credits = await countSongCredits(userId);
  const sub = await getActiveSubscription(userId);
  const plan = sub ? planById(sub.plan_id) : null;

  if (credits > 0) {
    const week = currentWeekWindow();
    const used = sub
      ? await sumUsageCents(
          userId,
          sub.current_period_start,
          sub.current_period_end,
        )
      : 0;
    return {
      ok: true,
      source: "song_credit",
      planId: "song",
      usageUsedCents: used,
      usageBudgetCents: plan?.usageBudgetCents ?? 0,
      songCredits: credits,
      remixesUsed: 0,
      remixesLimit: credits,
      remixPeriod: "credit",
      periodStart: iso(week.start),
      periodEnd: iso(week.end),
    };
  }

  if (sub && plan?.kind === "subscription" && plan.remixesPerWeek) {
    const week = currentWeekWindow();
    const remixesUsed = await countRemixesInRange(
      userId,
      week.start,
      week.end,
    );
    const usedCents = await sumUsageCents(
      userId,
      sub.current_period_start,
      sub.current_period_end,
    );
    const budget = sub.usage_budget_cents ?? plan.usageBudgetCents;
    const underRemixCap = remixesUsed < plan.remixesPerWeek;
    const underDollarCap = usedCents < budget;

    if (underRemixCap && underDollarCap) {
      return {
        ok: true,
        source: "subscription",
        planId: plan.id,
        usageUsedCents: usedCents,
        usageBudgetCents: budget,
        songCredits: 0,
        remixesUsed,
        remixesLimit: plan.remixesPerWeek,
        remixPeriod: "week",
        periodStart: iso(week.start),
        periodEnd: iso(week.end),
      };
    }

    return {
      ok: false,
      reason: !underRemixCap
        ? `Weekly remix limit reached (${plan.remixesPerWeek} / week on ${plan.name}). Resets next week, or upgrade for a bigger batch.`
        : "This month’s AI cost budget is used up. Upgrade or wait for the next billing period.",
      source: "subscription",
      planId: plan.id,
      usageUsedCents: usedCents,
      usageBudgetCents: budget,
      songCredits: 0,
      remixesUsed,
      remixesLimit: plan.remixesPerWeek,
      remixPeriod: "week",
      periodStart: iso(week.start),
      periodEnd: iso(week.end),
    };
  }

  // Free tier — 1 AI remix per calendar month.
  const month = currentMonthWindow();
  const remixesUsed = await countRemixesInRange(
    userId,
    month.start,
    month.end,
  );
  if (remixesUsed < FREE_REMIXES_PER_MONTH) {
    return {
      ok: true,
      source: "free",
      planId: "free",
      usageUsedCents: 0,
      usageBudgetCents: 0,
      songCredits: 0,
      remixesUsed,
      remixesLimit: FREE_REMIXES_PER_MONTH,
      remixPeriod: "month",
      periodStart: iso(month.start),
      periodEnd: iso(month.end),
    };
  }

  return {
    ok: false,
    reason:
      "Free tier includes 1 AI remix per month. Buy a mix credit or start a plan for weekly batches.",
    source: "free",
    planId: "free",
    usageUsedCents: 0,
    usageBudgetCents: 0,
    songCredits: 0,
    remixesUsed,
    remixesLimit: FREE_REMIXES_PER_MONTH,
    remixPeriod: "month",
    periodStart: iso(month.start),
    periodEnd: iso(month.end),
  };
}

/** Consume a song credit or record a remix against free/sub quota. */
export async function recordUsage(opts: {
  userId: string;
  kind: string;
  amountCents: number;
  description: string;
  preferSongCredit?: boolean;
}): Promise<{ via: "song_credit" | "subscription" | "free" }> {
  const sql = await getSql();
  const preferCredit = opts.preferSongCredit !== false;
  if (preferCredit) {
    const credits = await sql<{ id: string; remaining: number }>`
      select id, remaining from song_credit
      where user_id = ${opts.userId} and remaining > 0
      order by created_at asc
      limit 1
    `;
    const row = credits[0];
    if (row) {
      await sql`
        update song_credit
        set remaining = remaining - 1
        where id = ${row.id} and remaining > 0
      `;
      if (opts.kind === "mix_plan" || opts.kind === "remix") {
        const week = currentWeekWindow();
        await sql`
          insert into usage_ledger (
            id, user_id, kind, amount_cents, description, period_start, period_end
          ) values (
            ${newId("use")},
            ${opts.userId},
            ${"mix_plan"},
            ${0},
            ${opts.description},
            ${week.start},
            ${week.end}
          )
        `;
      } else {
        const until = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await sql`
          insert into usage_ledger (
            id, user_id, kind, amount_cents, description, period_end
          ) values (
            ${newId("use")},
            ${opts.userId},
            ${"song_bundle"},
            ${0},
            ${opts.description},
            ${until}
          )
        `;
      }
      return { via: "song_credit" };
    }
  }

  const entitlement = await getEntitlement(opts.userId);
  if (!entitlement.ok) {
    throw new Error(entitlement.reason ?? "Remix limit reached.");
  }

  if (entitlement.source === "subscription") {
    const sub = await getActiveSubscription(opts.userId);
    if (!sub) throw new Error("No active subscription.");
    const week = currentWeekWindow();
    await sql`
      insert into usage_ledger (
        id, user_id, kind, amount_cents, description, period_start, period_end
      ) values (
        ${newId("use")},
        ${opts.userId},
        ${opts.kind},
        ${opts.amountCents},
        ${opts.description},
        ${week.start},
        ${week.end}
      )
    `;
    return { via: "subscription" };
  }

  if (entitlement.source === "free") {
    const month = currentMonthWindow();
    await sql`
      insert into usage_ledger (
        id, user_id, kind, amount_cents, description, period_start, period_end
      ) values (
        ${newId("use")},
        ${opts.userId},
        ${opts.kind},
        ${0},
        ${opts.description},
        ${month.start},
        ${month.end}
      )
    `;
    return { via: "free" };
  }

  throw new Error("No remix quota available.");
}

/** True when a single-song purchase still covers vocal render. */
export async function hasOpenSongBundle(userId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from usage_ledger
    where user_id = ${userId}
      and kind = 'song_bundle'
      and period_end > CURRENT_TIMESTAMP
    order by created_at desc
    limit 1
  `;
  return Boolean(rows[0]);
}

export async function grantSongCredits(opts: {
  userId: string;
  count: number;
  source: string;
  paymentId?: string | null;
}) {
  const sql = await getSql();
  for (let i = 0; i < opts.count; i++) {
    await sql`
      insert into song_credit (id, user_id, source, remaining, payment_id)
      values (
        ${newId("sc")},
        ${opts.userId},
        ${opts.source},
        ${1},
        ${opts.paymentId ?? null}
      )
    `;
  }
}

export async function grantUsageCredit(opts: {
  userId: string;
  amountCents: number;
  description: string;
  adminUserId?: string;
}) {
  const sql = await getSql();
  const sub = await getActiveSubscription(opts.userId);
  await sql`
    insert into usage_ledger (
      id, user_id, kind, amount_cents, description, period_start, period_end
    ) values (
      ${newId("use")},
      ${opts.userId},
      ${"admin_grant"},
      ${-Math.abs(opts.amountCents)},
      ${opts.description},
      ${sub?.current_period_start ?? null},
      ${sub?.current_period_end ?? null}
    )
  `;
}

export function estimateLyricsCostCents(): number {
  return 5;
}

export function estimateMixCostCents(): number {
  return COST_PER_REMIX_CENTS;
}

export function estimateVocalCostCents(text: string): number {
  const chars = Math.max(text.length, 1);
  const cents = Math.ceil((chars / 1_000_000) * 1500);
  return Math.max(cents, 3);
}

export function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export { PLANS, SUBSCRIPTION_PLAN_IDS, planById, FREE_REMIXES_PER_MONTH };
export { currentMonthWindow, currentWeekWindow } from "@/lib/billing/quota-windows";
