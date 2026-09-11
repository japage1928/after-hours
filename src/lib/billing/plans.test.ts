import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COST_PER_REMIX_CENTS,
  FREE_REMIXES_PER_MONTH,
  PLANS,
  formatUsd,
  freeTierBlockedReason,
  freeTierIncludesCopy,
  planById,
  remixCapWithinBudget,
  stripePriceIdForPlan,
} from "./plans.ts";
import { currentMonthWindow, currentWeekWindow } from "./quota-windows.ts";

describe("pricing catalog", () => {
  it("locks retail prices, remix caps, and ~30% cost budgets", () => {
    assert.equal(PLANS.song.priceCents, 299);
    assert.equal(PLANS.basic.priceCents, 999);
    assert.equal(PLANS.plus.priceCents, 1999);
    assert.equal(PLANS.pro.priceCents, 2999);
    assert.equal(PLANS.basic.usageBudgetCents, 300);
    assert.equal(PLANS.plus.usageBudgetCents, 600);
    assert.equal(PLANS.pro.usageBudgetCents, 900);
    assert.equal(PLANS.song.songCredits, 1);
    assert.equal(PLANS.song.name, "One song");
    assert.equal(FREE_REMIXES_PER_MONTH, 2);
    assert.match(freeTierIncludesCopy(), /2 AI generates or remixes/);
    assert.match(freeTierBlockedReason(), /Mashups of tracks you own/);
    assert.equal(PLANS.basic.remixesPerWeek, 4);
    assert.equal(PLANS.basic.remixesPerMonth, 16);
    assert.equal(PLANS.plus.remixesPerWeek, 8);
    assert.equal(PLANS.plus.remixesPerMonth, 32);
    assert.equal(PLANS.pro.remixesPerWeek, 12);
    assert.equal(PLANS.pro.remixesPerMonth, 48);
    assert.equal(COST_PER_REMIX_CENTS, 19);
    for (const plan of Object.values(PLANS)) {
      assert.equal(remixCapWithinBudget(plan), true);
    }
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

describe("quota windows", () => {
  it("builds a Monday–Monday UTC week", () => {
    // Wednesday 2026-09-09 UTC
    const { start, end } = currentWeekWindow(
      new Date(Date.UTC(2026, 8, 9, 15, 0, 0)),
    );
    assert.equal(start.toISOString(), "2026-09-07T00:00:00.000Z");
    assert.equal(end.toISOString(), "2026-09-14T00:00:00.000Z");
  });

  it("builds a calendar month window", () => {
    const { start, end } = currentMonthWindow(
      new Date(Date.UTC(2026, 8, 11, 12, 0, 0)),
    );
    assert.equal(start.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(end.toISOString(), "2026-10-01T00:00:00.000Z");
  });
});
