import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bytesFromBase64,
  clampVideoDuration,
  grokVideoConfigured,
  grokVideoModel,
  humanImagineFailure,
  imagineGenerateBody,
  isVideoAspect,
  mimeFromVideoUrl,
  respectModerationFromPoll,
  XAI_VIDEO_GENERATIONS_URL,
  xaiVideoStatusUrl,
} from "./grok-video.ts";
import { fallbackVideoJob } from "./grok-video-prompt.ts";

describe("Grok video helpers", () => {
  it("clamps duration to Imagine's 1–15s window", () => {
    assert.equal(clampVideoDuration(0), 1);
    assert.equal(clampVideoDuration(8.4), 8);
    assert.equal(clampVideoDuration(40), 15);
  });

  it("accepts Imagine aspect ratios only", () => {
    assert.equal(isVideoAspect("16:9"), true);
    assert.equal(isVideoAspect("9:16"), true);
    assert.equal(isVideoAspect("21:9"), false);
  });

  it("reads config from XAI_API_KEY and optional model pin", () => {
    assert.equal(grokVideoConfigured({}), false);
    assert.equal(grokVideoConfigured({ XAI_API_KEY: "xai-test" }), true);
    assert.equal(grokVideoModel({}), "grok-imagine-video-1.5");
    assert.equal(
      grokVideoModel({ XAI_VIDEO_MODEL: "grok-imagine-video" }),
      "grok-imagine-video",
    );
  });

  it("guesses mime from the delivery URL", () => {
    assert.equal(mimeFromVideoUrl("https://vidgen.x.ai/clip.mp4"), "video/mp4");
    assert.equal(mimeFromVideoUrl("https://x.ai/a.webm?sig=1"), "video/webm");
  });

  it("counts base64 payload bytes", () => {
    assert.equal(bytesFromBase64(""), 0);
    assert.equal(bytesFromBase64("aaaa"), 3);
    assert.equal(bytesFromBase64("aaa="), 2);
  });

  it("builds the documented Imagine text-to-video body", () => {
    const body = imagineGenerateBody({
      prompt:
        "A glowing crystal-powered rocket launching from the red dunes of Mars",
      durationSec: 10,
      aspectRatio: "16:9",
      resolution: "720p",
      summary: "Mars rocket",
    });
    assert.deepEqual(body, {
      model: "grok-imagine-video-1.5",
      prompt:
        "A glowing crystal-powered rocket launching from the red dunes of Mars",
      duration: 10,
      aspect_ratio: "16:9",
      resolution: "720p",
    });
    assert.equal(
      XAI_VIDEO_GENERATIONS_URL,
      "https://api.x.ai/v1/videos/generations",
    );
    assert.equal(
      xaiVideoStatusUrl("d97415a1-5796-b7ec-379f-4e6819e08fdf"),
      "https://api.x.ai/v1/videos/d97415a1-5796-b7ec-379f-4e6819e08fdf",
    );
  });

  it("passes the xAI respect_moderation flag through as-is", () => {
    assert.equal(respectModerationFromPoll(true), true);
    assert.equal(respectModerationFromPoll(undefined), true);
    assert.equal(respectModerationFromPoll(false), false);
  });

  it("maps documented Imagine error codes", () => {
    assert.match(
      humanImagineFailure({
        code: "invalid_argument",
        message: "Prompt cannot be empty.",
      }),
      /cannot be empty/i,
    );
    assert.match(
      humanImagineFailure({ code: "service_unavailable" }),
      /busy/i,
    );
    assert.match(humanImagineFailure({ code: "internal_error" }), /internal/i);
  });
});

describe("fallbackVideoJob", () => {
  it("expands a thin human prompt into a camera-aware Imagine brief", () => {
    const job = fallbackVideoJob({
      prompt: "Neon rain on a midnight taxi",
      durationSec: 8,
      aspectRatio: "9:16",
    });
    assert.equal(job.durationSec, 8);
    assert.equal(job.aspectRatio, "9:16");
    assert.match(job.prompt, /Neon rain/);
    assert.match(job.prompt, /vertical/);
    assert.ok(job.prompt.length >= 12);
    assert.match(job.summary, /Neon rain/);
  });
});
