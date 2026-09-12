import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VIDEO_STUDIO } from "./video-booth.ts";

describe("video studio copy", () => {
  it("lives on /video and names Grok Imagine, not ACE-Step", () => {
    assert.equal(VIDEO_STUDIO.path, "/video");
    assert.match(VIDEO_STUDIO.engineLine, /Grok Imagine/);
    assert.match(VIDEO_STUDIO.blurb, /Grok Imagine/);
    assert.doesNotMatch(VIDEO_STUDIO.blurb, /Suno/i);
    assert.match(VIDEO_STUDIO.defaultPrompt, /Neon rain/i);
    assert.ok(VIDEO_STUDIO.presets.length >= 3);
    assert.equal(
      VIDEO_STUDIO.defaultPrompt,
      VIDEO_STUDIO.presets[0]?.prompt,
    );
  });
});
