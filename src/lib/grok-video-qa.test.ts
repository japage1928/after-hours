import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GrokVideoResult, VideoJob } from "./grok-video.ts";
import {
  humanVideoQaError,
  mergeVerdicts,
  qaGrokVideoRaw,
  qaVideoJob,
} from "./grok-video-qa.ts";

function job(partial: Partial<VideoJob> = {}): VideoJob {
  return {
    prompt:
      "Neon rain on a midnight taxi, wet asphalt reflections, slow push-in, original scene.",
    durationSec: 8,
    aspectRatio: "16:9",
    resolution: "720p",
    summary: "Midnight taxi in the rain",
    ...partial,
  };
}

function result(partial: Partial<GrokVideoResult> = {}): GrokVideoResult {
  return {
    videoBase64: "a".repeat(20_000),
    mime: "video/mp4",
    durationSec: 8,
    prompt: job().prompt,
    summary: "Midnight taxi",
    requestId: "req_1",
    model: "grok-imagine-video-1.5",
    respectModeration: true,
    byteLength: 15_000,
    ...partial,
  };
}

describe("video job QA", () => {
  it("passes a normal cinematic brief", () => {
    const v = qaVideoJob(job(), "neon rain taxi midnight");
    assert.equal(v.ok, true);
  });

  it("rejects thin prompts", () => {
    const v = qaVideoJob(job({ prompt: "short clip" }));
    assert.equal(v.ok, false);
    assert.match(v.reasons.join(" "), /thin/i);
  });

  it("rejects sexual content involving minors", () => {
    const v = qaVideoJob(
      job({
        prompt: "A child in a sexual nude scene walking through a park at dusk",
      }),
    );
    assert.equal(v.ok, false);
    assert.match(v.reasons.join(" "), /minors/i);
  });
});

describe("video raw QA", () => {
  it("rejects tiny payloads", () => {
    const v = qaGrokVideoRaw(result({ videoBase64: "aaaa", byteLength: 3 }));
    assert.equal(v.ok, false);
  });

  it("rejects unsafe moderation flags", () => {
    const v = qaGrokVideoRaw(result({ respectModeration: false }));
    assert.equal(v.ok, false);
    assert.match(v.reasons.join(" "), /unsafe/i);
  });

  it("treats a moderation-fail empty payload as unsafe, not empty", () => {
    const v = qaGrokVideoRaw(
      result({
        respectModeration: false,
        videoBase64: "",
        byteLength: 0,
      }),
    );
    assert.equal(v.ok, false);
    assert.match(v.reasons.join(" "), /unsafe/i);
    assert.doesNotMatch(v.reasons.join(" "), /tiny|missing/i);
    assert.match(humanVideoQaError(v.reasons), /safety/i);
  });

  it("passes a large-enough mp4", () => {
    const v = qaGrokVideoRaw(result());
    assert.equal(v.ok, true);
  });
});

describe("video QA copy", () => {
  it("merges verdicts and speaks plainly", () => {
    const v = mergeVerdicts(
      { ok: true, reasons: [] },
      { ok: false, reasons: ["Video payload missing or tiny."] },
    );
    assert.equal(v.ok, false);
    assert.match(humanVideoQaError(v.reasons), /empty/i);
  });
});
