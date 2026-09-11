import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capabilityCopy,
  engineLabel,
  humanizeStudioError,
} from "./studio-errors.ts";

describe("humanizeStudioError", () => {
  it("hides Replicate token details from normal users", () => {
    assert.match(
      humanizeStudioError(
        "REPLICATE_API_TOKEN was rejected. Check the token on this deploy.",
        { owner: true },
      ),
      /rejected/i,
    );
    assert.doesNotMatch(
      humanizeStudioError(
        "REPLICATE_API_TOKEN was rejected. Check the token on this deploy.",
      ),
      /REPLICATE_API_TOKEN/,
    );
    assert.match(
      humanizeStudioError(
        "REPLICATE_API_TOKEN was rejected. Check the token on this deploy.",
      ),
      /temporarily unavailable/i,
    );
  });

  it("explains missing ACE-Step config to the owner only", () => {
    assert.match(
      humanizeStudioError("ACE-Step is not configured on this deploy.", {
        owner: true,
      }),
      /REPLICATE_API_TOKEN/,
    );
    assert.doesNotMatch(
      humanizeStudioError("ACE-Step is not configured on this deploy."),
      /REPLICATE_API_TOKEN/,
    );
    assert.match(
      humanizeStudioError("ACE-Step is not configured on this deploy."),
      /temporarily unavailable/i,
    );
  });

  it("turns quota blocks into paywall copy", () => {
    const raw =
      "Free tier includes 2 AI generates or remixes per month. Buy a mix credit or start a plan for weekly batches. Mashups of tracks you own don’t use this quota.";
    assert.match(humanizeStudioError(raw), /out of AI songs/i);
    assert.match(humanizeStudioError(raw), /plan/i);
  });

  it("explains timeouts and 5xx without leaking setup", () => {
    assert.match(humanizeStudioError("The operation timed out"), /too long|retry/i);
    assert.match(humanizeStudioError("ACE-Step failed (503)"), /down or busy/i);
  });

  it("explains oversized uploads", () => {
    assert.match(humanizeStudioError("Keep each track under 40 MB."), /40 MB/);
  });
});

describe("capabilityCopy", () => {
  it("does not claim Suno", () => {
    const { engineLabel: label } = capabilityCopy({
      aceStep: true,
      owner: false,
      backend: "replicate",
      model: "fishaudio/ace-step-1.5",
    });
    assert.match(label, /ACE-Step/);
    assert.match(label, /Replicate/);
    assert.doesNotMatch(label, /Suno/i);
  });

  it("gives the owner a setup hint and users a friendly unavailable line", () => {
    const owner = capabilityCopy({
      aceStep: false,
      owner: true,
      backend: "none",
    });
    assert.match(owner.engineLabel, /not configured/i);
    assert.match(owner.setupHint ?? "", /REPLICATE_API_TOKEN/);

    const user = capabilityCopy({
      aceStep: false,
      owner: false,
      backend: "none",
    });
    assert.match(user.engineLabel, /temporarily unavailable/i);
    assert.equal(user.setupHint, null);
    assert.doesNotMatch(user.engineLabel, /REPLICATE_API_TOKEN/);
  });

  it("labels a hosted GPU backend honestly", () => {
    const { engineLabel: label } = capabilityCopy({
      aceStep: true,
      owner: true,
      backend: "host",
    });
    assert.match(label, /GPU host/);
    assert.doesNotMatch(label, /Suno/i);
  });
});

describe("engineLabel", () => {
  it("does not claim Suno", () => {
    const label = engineLabel({ aceStep: true, xai: true });
    assert.match(label, /ACE-Step/);
    assert.doesNotMatch(label, /Suno/i);
  });
});
