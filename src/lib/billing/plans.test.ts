import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLANS,
  formatUsd,
  planById,
  stripePriceIdForPlan,
} from "./plans.ts";

describe("pricing catalog", () => {
  it("locks retail prices and 30% usage caps", () => {
    assert.equal(PLANS.song.priceCents, 299);
    assert.equal(PLANS.basic.priceCents, 999);
    assert.equal(PLANS.plus.priceCents, 1999);
    assert.equal(PLANS.pro.priceCents, 2999);
    assert.equal(PLANS.basic.usageBudgetCents, 300);
    assert.equal(PLANS.plus.usageBudgetCents, 600);
    assert.equal(PLANS.pro.usageBudgetCents, 900);
    assert.equal(PLANS.song.songCredits, 1);
  });

  it("formats money and resolves env price ids", () => {
    assert.equal(formatUsd(299), "$2.99");
    assert.equal(planById("plus")?.name, "Plus");
    assert.equal(
      stripePriceIdForPlan("basic", { STRIPE_PRICE_BASIC: "price_123" }),
      "price_123",
    );
  });
});
