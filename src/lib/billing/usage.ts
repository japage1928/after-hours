import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  PLANS,
  planById,
  type PlanId,
  SUBSCRIPTION_PLAN_IDS,
} from "@/lib/billing/plans";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export type Entitlement = {
  ok: boolean;
  reason?: string;
  source?: "song_credit" | "subscription" | "admin";
  planId?: PlanId | null;
  usageUsedCents: number;
  usageBudgetCents: number;
  songCredits: number;
  periodStart: string | null;
  periodEnd: string | null;
};

const ACTIVE_SUB_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

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
  `;
  return Math.max(0, Number(rows[0]?.total ?? 0));
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const credits = await countSongCredits(userId);
  const sub = await getActiveSubscription(userId);
  const periodStart = sub?.current_period_start
    ? iso(sub.current_period_start)
    : null;
  const periodEnd = sub?.current_period_end
    ? iso(sub.current_period_end)
    : null;
  const budget = sub?.usage_budget_cents ?? 0;
  const used = sub
    ? await sumUsageCents(userId, sub.current_period_start, sub.current_period_end)
    : 0;

  if (credits > 0) {
    return {
      ok: true,
      source: "song_credit",
      planId: "song",
      usageUsedCents: used,
      usageBudgetCents: budget,
      songCredits: credits,
      periodStart,
      periodEnd,
    };
  }

  if (sub && used < budget) {
    return {
      ok: true,
      source: "subscription",
      planId: (planById(sub.plan_id)?.id as PlanId) ?? null,
      usageUsedCents: used,
      usageBudgetCents: budget,
      songCredits: 0,
      periodStart,
      periodEnd,
    };
  }

  if (sub && used >= budget) {
    return {
      ok: false,
      reason:
        "AI usage for this billing period is used up. Buy a single song or upgrade your plan.",
      source: "subscription",
      planId: (planById(sub.plan_id)?.id as PlanId) ?? null,
      usageUsedCents: used,
      usageBudgetCents: budget,
      songCredits: 0,
      periodStart,
      periodEnd,
    };
  }

  return {
    ok: false,
    reason: "Buy a song credit or start a plan to use AI writing features.",
    usageUsedCents: 0,
    usageBudgetCents: 0,
    songCredits: 0,
    periodStart: null,
    periodEnd: null,
  };
}

/** Consume a song credit or reserve subscription usage after a successful AI call. */
export async function recordUsage(opts: {
  userId: string;
  kind: string;
  amountCents: number;
  description: string;
  preferSongCredit?: boolean;
}): Promise<{ via: "song_credit" | "subscription" }> {
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
      return { via: "song_credit" };
    }
  }

  const sub = await getActiveSubscription(opts.userId);
  if (!sub) throw new Error("No active subscription or song credit.");
  const used = await sumUsageCents(
    opts.userId,
    sub.current_period_start,
    sub.current_period_end,
  );
  if (used + opts.amountCents > sub.usage_budget_cents) {
    throw new Error("Usage would exceed this period's budget.");
  }
  await sql`
    insert into usage_ledger (
      id, user_id, kind, amount_cents, description, period_start, period_end
    ) values (
      ${newId("use")},
      ${opts.userId},
      ${opts.kind},
      ${opts.amountCents},
      ${opts.description},
      ${sub.current_period_start},
      ${sub.current_period_end}
    )
  `;
  return { via: "subscription" };
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
  // ~2k in @ $2/M + ~1.5k out @ $6/M ≈ 1.3¢; pad to 5¢ for safety.
  return 5;
}

export function estimateMixCostCents(): number {
  return 2;
}

export function estimateVocalCostCents(text: string): number {
  // xAI TTS ≈ $15 / 1M characters.
  const chars = Math.max(text.length, 1);
  const cents = Math.ceil((chars / 1_000_000) * 1500);
  return Math.max(cents, 3);
}

export function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export { PLANS, SUBSCRIPTION_PLAN_IDS, planById };
