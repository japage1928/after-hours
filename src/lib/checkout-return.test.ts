import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkoutCancelUrl,
  checkoutSuccessUrl,
  consumeCheckoutSuccessLocation,
  isCheckoutSuccessSearch,
} from "./checkout-return.ts";

describe("checkout return URLs", () => {
  it("sends paid users back to Generate, not the marketing home", () => {
    assert.equal(
      checkoutSuccessUrl("https://after-hours.example"),
      "https://after-hours.example/generate?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    );
    assert.equal(
      checkoutCancelUrl("https://after-hours.example"),
      "https://after-hours.example/pricing?checkout=cancel",
    );
  });

  it("detects and consumes the success query without leaving session ids in the URL", () => {
    assert.equal(isCheckoutSuccessSearch("?checkout=success&session_id=cs_123"), true);
    assert.equal(isCheckoutSuccessSearch("?checkout=cancel"), false);
    assert.equal(
      consumeCheckoutSuccessLocation("/generate", "?checkout=success&session_id=cs_123"),
      "/generate",
    );
  });
});
