import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { engineLabel, humanizeStudioError } from "./studio-errors.ts";

describe("humanizeStudioError", () => {
  it("explains a rejected Replicate token separately from a missing one", () => {
    assert.match(
      humanizeStudioError(
        "REPLICATE_API_TOKEN was rejected. Check the token on this deploy.",
      ),
      /rejected/i,
    );
    assert.doesNotMatch(
      humanizeStudioError(
        "REPLICATE_API_TOKEN was rejected. Check the token on this deploy.",
      ),
      /isn’t set up/,
    );
  });

  it("explains missing ACE-Step config", () => {
    assert.match(
      humanizeStudioError("ACE-Step is not configured on this deploy."),
      /REPLICATE_API_TOKEN/,
    );
  });

  it("passes quota copy through", () => {
    const raw =
      "Free tier includes 2 AI generates or remixes per month. Buy a mix credit or start a plan for weekly batches. Mashups of tracks you own don’t use this quota.";
    assert.equal(humanizeStudioError(raw), raw);
  });

  it("explains timeouts and 5xx", () => {
    assert.match(humanizeStudioError("The operation timed out"), /timed out/i);
    assert.match(humanizeStudioError("ACE-Step failed (503)"), /down or busy/i);
  });

  it("explains oversized uploads", () => {
    assert.match(humanizeStudioError("Keep each track under 40 MB."), /40 MB/);
  });
});

describe("engineLabel", () => {
  it("does not claim Suno", () => {
    const label = engineLabel({ aceStep: true, xai: true });
    assert.match(label, /ACE-Step/);
    assert.doesNotMatch(label, /Suno/i);
  });

  it("says when ACE-Step is missing", () => {
    assert.match(engineLabel({ aceStep: false, xai: true }), /REPLICATE_API_TOKEN/i);
  });

  it("labels Replicate honestly", () => {
    assert.match(
      engineLabel({ aceStep: true, xai: false, backend: "replicate" }),
      /Replicate/,
    );
    assert.doesNotMatch(
      engineLabel({ aceStep: true, xai: false, backend: "replicate" }),
      /Suno/i,
    );
  });
});
