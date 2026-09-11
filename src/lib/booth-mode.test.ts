import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOTH_MODE_ORDER,
  BOOTH_MODES,
  isBoothMode,
  safeNextPath,
} from "./booth-mode.ts";

describe("booth modes", () => {
  it("exposes generate, remix, and mashup in that order", () => {
    assert.deepEqual(BOOTH_MODE_ORDER, ["generate", "remix", "mashup"]);
    assert.equal(isBoothMode("generate"), true);
    assert.equal(isBoothMode("write"), false);
    assert.equal(BOOTH_MODES.generate.path, "/generate");
  });

  it("allows generate as a post-login redirect", () => {
    assert.equal(safeNextPath("/generate"), "/generate");
    assert.equal(safeNextPath("/remix"), "/remix");
    assert.equal(safeNextPath("/help"), "/help");
    assert.equal(safeNextPath(""), "/generate");
    assert.equal(safeNextPath(undefined), "/generate");
    assert.equal(safeNextPath("https://evil.example/phish"), "/generate");
  });
});
