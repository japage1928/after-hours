#!/usr/bin/env node
/**
 * Create After Hours Stripe products + prices and print env lines to paste
 * into Vercel. Requires STRIPE_SECRET_KEY.
 *
 *   STRIPE_SECRET_KEY=sk_... node scripts/stripe-setup.mjs
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("Set STRIPE_SECRET_KEY before running stripe:setup");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });

const catalog = [
  {
    planId: "song",
    name: "After Hours — Single song",
    env: "STRIPE_PRICE_SONG",
    amount: 299,
    mode: "one_time",
  },
  {
    planId: "basic",
    name: "After Hours — Basic",
    env: "STRIPE_PRICE_BASIC",
    amount: 999,
    mode: "subscription",
  },
  {
    planId: "plus",
    name: "After Hours — Plus",
    env: "STRIPE_PRICE_PLUS",
    amount: 1999,
    mode: "subscription",
  },
  {
    planId: "pro",
    name: "After Hours — Pro",
    env: "STRIPE_PRICE_PRO",
    amount: 2999,
    mode: "subscription",
  },
];

const out = {};

for (const item of catalog) {
  const product = await stripe.products.create({
    name: item.name,
    metadata: { plan_id: item.planId, app: "after-hours" },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: item.amount,
    currency: "usd",
    ...(item.mode === "subscription"
      ? { recurring: { interval: "month" } }
      : {}),
    metadata: { plan_id: item.planId },
  });
  out[item.env] = price.id;
  console.log(`Created ${item.planId}: product=${product.id} price=${price.id}`);
}

console.log("\n# Paste into Vercel env (production + preview):\n");
for (const [k, v] of Object.entries(out)) {
  console.log(`${k}=${v}`);
}
