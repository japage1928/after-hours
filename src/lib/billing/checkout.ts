import { getRequest } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import {
  PLANS,
  planIdFromStripePrice,
  stripePriceIdForPlan,
  type PlanId,
} from "@/lib/billing/plans";
import { appOrigin, getStripe } from "@/lib/billing/stripe";
import {
  getActiveSubscription,
  grantSongCredits,
  newId,
} from "@/lib/billing/usage";

export async function requireSessionUser() {
  const request = getRequest();
  if (!request) throw new Error("Unauthorized");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user;
}

export async function ensureStripeCustomer(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}): Promise<string> {
  const sql = await getSql();
  const existing = await sql<{ stripe_customer_id: string }>`
    select stripe_customer_id from billing_customer where user_id = ${user.id}
  `;
  if (existing[0]?.stripe_customer_id) return existing[0].stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    metadata: { user_id: user.id },
  });
  await sql`
    insert into billing_customer (user_id, stripe_customer_id, email, updated_at)
    values (${user.id}, ${customer.id}, ${user.email ?? null}, CURRENT_TIMESTAMP)
    on conflict (user_id) do update set
      stripe_customer_id = excluded.stripe_customer_id,
      email = excluded.email,
      updated_at = CURRENT_TIMESTAMP
  `;
  return customer.id;
}

export async function createCheckoutSession(opts: {
  user: { id: string; email?: string | null; name?: string | null };
  planId: PlanId;
}) {
  const plan = PLANS[opts.planId];
  const priceId = stripePriceIdForPlan(opts.planId);
  if (!priceId) {
    throw new Error(
      `Missing Stripe price for ${plan.id}. Set ${plan.stripePriceEnv} or run npm run stripe:setup.`,
    );
  }
  const customerId = await ensureStripeCustomer(opts.user);
  const stripe = getStripe();
  const origin = appOrigin();
  const paymentId = newId("pay");

  const session = await stripe.checkout.sessions.create({
    mode: plan.kind === "subscription" ? "subscription" : "payment",
    customer: customerId,
    client_reference_id: opts.user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?checkout=cancel`,
    metadata: {
      user_id: opts.user.id,
      plan_id: plan.id,
      payment_id: paymentId,
    },
    ...(plan.kind === "subscription"
      ? {
          subscription_data: {
            metadata: {
              user_id: opts.user.id,
              plan_id: plan.id,
            },
          },
        }
      : {
          payment_intent_data: {
            metadata: {
              user_id: opts.user.id,
              plan_id: plan.id,
              payment_id: paymentId,
            },
          },
        }),
  });

  const sql = await getSql();
  await sql`
    insert into billing_payment (
      id, user_id, kind, status, plan_id, amount_cents, currency,
      stripe_checkout_session_id, metadata_json, updated_at
    ) values (
      ${paymentId},
      ${opts.user.id},
      ${plan.kind === "subscription" ? "subscription_checkout" : "song_checkout"},
      ${"open"},
      ${plan.id},
      ${plan.priceCents},
      ${"usd"},
      ${session.id},
      ${JSON.stringify({ stripe_session_id: session.id })},
      CURRENT_TIMESTAMP
    )
  `;

  if (!session.url) throw new Error("Stripe Checkout did not return a URL.");
  return { url: session.url, sessionId: session.id, paymentId };
}

export async function createBillingPortalSession(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}) {
  const customerId = await ensureStripeCustomer(user);
  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appOrigin()}/settings?tab=billing`,
  });
  return { url: portal.url };
}

/** Cancel the caller's Stripe subscription (at period end by default). */
export async function cancelSubscriptionForUser(
  userId: string,
  opts: { immediately?: boolean } = {},
) {
  const sub = await getActiveSubscription(userId);
  if (!sub) throw new Error("No active subscription to cancel");
  const stripe = getStripe();
  const updated = opts.immediately
    ? await stripe.subscriptions.cancel(sub.id)
    : await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
      });
  await upsertSubscriptionFromStripe(updated as never);
  return { subscriptionId: sub.id, immediately: Boolean(opts.immediately) };
}

/** Undo a pending cancel-at-period-end. */
export async function resumeSubscriptionForUser(userId: string) {
  const sub = await getActiveSubscription(userId);
  if (!sub) throw new Error("No active subscription to resume");
  if (!sub.cancel_at_period_end) {
    throw new Error("Subscription is not scheduled to cancel");
  }
  const stripe = getStripe();
  const updated = await stripe.subscriptions.update(sub.id, {
    cancel_at_period_end: false,
  });
  await upsertSubscriptionFromStripe(updated as never);
  return { subscriptionId: sub.id };
}

export async function upsertSubscriptionFromStripe(sub: {
  id: string;
  status: string;
  customer: string | { id: string };
  items: {
    data: Array<{
      price: { id: string };
      current_period_start?: number | null;
      current_period_end?: number | null;
    }>;
  };
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string> | null;
}) {
  const sql = await getSql();
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const customers = await sql<{ user_id: string }>`
    select user_id from billing_customer where stripe_customer_id = ${customerId}
  `;
  const userId =
    customers[0]?.user_id ?? sub.metadata?.user_id ?? null;
  if (!userId) {
    throw new Error(`No user mapped for Stripe customer ${customerId}`);
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? "";
  const planId =
    (sub.metadata?.plan_id as PlanId | undefined) ??
    planIdFromStripePrice(priceId) ??
    "basic";
  const plan = PLANS[planId] ?? PLANS.basic;
  const startUnix =
    item?.current_period_start ?? sub.current_period_start ?? null;
  const endUnix = item?.current_period_end ?? sub.current_period_end ?? null;
  const periodStart = startUnix ? new Date(startUnix * 1000) : null;
  const periodEnd = endUnix ? new Date(endUnix * 1000) : null;

  await sql`
    insert into billing_subscription (
      id, user_id, plan_id, status, stripe_price_id,
      current_period_start, current_period_end, cancel_at_period_end,
      usage_budget_cents, updated_at
    ) values (
      ${sub.id},
      ${userId},
      ${plan.id},
      ${sub.status},
      ${priceId},
      ${periodStart},
      ${periodEnd},
      ${Boolean(sub.cancel_at_period_end)},
      ${plan.usageBudgetCents},
      CURRENT_TIMESTAMP
    )
    on conflict (id) do update set
      user_id = excluded.user_id,
      plan_id = excluded.plan_id,
      status = excluded.status,
      stripe_price_id = excluded.stripe_price_id,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      usage_budget_cents = excluded.usage_budget_cents,
      updated_at = CURRENT_TIMESTAMP
  `;

  return { userId, planId: plan.id };
}

export async function markCheckoutComplete(session: {
  id: string;
  payment_status?: string | null;
  mode?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | { id: string } | null;
  invoice?: string | { id: string } | null;
  status?: string | null;
}) {
  const sql = await getSql();
  const paymentId = session.metadata?.payment_id;
  const userId = session.metadata?.user_id;
  const planId = session.metadata?.plan_id as PlanId | undefined;
  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const invoice =
    typeof session.invoice === "string"
      ? session.invoice
      : session.invoice?.id ?? null;

  const status =
    session.payment_status === "paid" || session.status === "complete"
      ? "complete"
      : session.status === "expired"
        ? "expired"
        : "open";

  if (paymentId) {
    await sql`
      update billing_payment set
        status = ${status},
        stripe_payment_intent_id = coalesce(${pi}, stripe_payment_intent_id),
        stripe_invoice_id = coalesce(${invoice}, stripe_invoice_id),
        updated_at = CURRENT_TIMESTAMP
      where id = ${paymentId}
    `;
  } else {
    await sql`
      update billing_payment set
        status = ${status},
        stripe_payment_intent_id = coalesce(${pi}, stripe_payment_intent_id),
        stripe_invoice_id = coalesce(${invoice}, stripe_invoice_id),
        updated_at = CURRENT_TIMESTAMP
      where stripe_checkout_session_id = ${session.id}
    `;
  }

  if (status === "complete" && planId === "song" && userId) {
    const already = await sql<{ n: number }>`
      select count(*)::int as n from song_credit
      where payment_id = ${paymentId ?? session.id}
    `;
    if (Number(already[0]?.n ?? 0) === 0) {
      await grantSongCredits({
        userId,
        count: PLANS.song.songCredits,
        source: "purchase",
        paymentId: paymentId ?? session.id,
      });
    }
  }
}

export async function markPaymentFailed(opts: {
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  invoiceId?: string | null;
  message?: string | null;
}) {
  const sql = await getSql();
  if (opts.checkoutSessionId) {
    await sql`
      update billing_payment set
        status = ${"failed"},
        failure_message = ${opts.message ?? "Payment failed"},
        updated_at = CURRENT_TIMESTAMP
      where stripe_checkout_session_id = ${opts.checkoutSessionId}
    `;
  }
  if (opts.paymentIntentId) {
    await sql`
      update billing_payment set
        status = ${"failed"},
        failure_message = ${opts.message ?? "Payment failed"},
        updated_at = CURRENT_TIMESTAMP
      where stripe_payment_intent_id = ${opts.paymentIntentId}
    `;
  }
  if (opts.invoiceId) {
    await sql`
      update billing_payment set
        status = ${"failed"},
        failure_message = ${opts.message ?? "Invoice payment failed"},
        updated_at = CURRENT_TIMESTAMP
      where stripe_invoice_id = ${opts.invoiceId}
    `;
  }
}
