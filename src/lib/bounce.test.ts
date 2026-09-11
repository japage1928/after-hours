import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bounceOutputDuration,
  floatTo16BitPcm,
  mashupMixRecipe,
  playbackRateToMatchBpm,
  remixMixRecipe,
  wavBytesFromPcm,
} from "./bounce.ts";

describe("playbackRateToMatchBpm", () => {
  it("is 1 when tempos match", () => {
    assert.equal(playbackRateToMatchBpm(120, 120), 1);
  });

  it("speeds overlay up when overlay is slower than the bed", () => {
    const rate = playbackRateToMatchBpm(90, 120);
    assert.ok(rate > 1, `expected slower overlay to play faster, got ${rate}`);
  });

  it("clamps extreme tempo gaps", () => {
    assert.equal(playbackRateToMatchBpm(60, 180), 1.4);
    assert.equal(playbackRateToMatchBpm(180, 60), 0.7);
  });
});

describe("mix recipes", () => {
  it("remixes overlay original onto a new bed with no delay", () => {
    const r = remixMixRecipe({ originalBpm: 100, bedBpm: 128 });
    assert.equal(r.overlayDelaySec, 0);
    assert.equal(r.bedLowpassHz, null);
    assert.ok(r.overlayHighpassHz >= 150);
  });

  it("mashup delays lyrics by two bars of the beat", () => {
    const r = mashupMixRecipe({ beatsBpm: 120, lyricsBpm: 90 });
    assert.equal(r.overlayDelaySec, 4); // 2 bars at 120 BPM
    assert.ok(r.bedLowpassHz);
    assert.ok(r.overlayHighpassHz >= 180);
  });
});

describe("bounceOutputDuration", () => {
  it("covers the longer of bed vs delayed overlay", () => {
    const recipe = mashupMixRecipe({ beatsBpm: 120, lyricsBpm: 120 });
    const d = bounceOutputDuration({
      bedDurationSec: 30,
      overlayDurationSec: 20,
      recipe,
    });
    assert.ok(d >= 30);
    assert.ok(d <= 180);
  });
});

describe("wav encoding", () => {
  it("writes a valid RIFF header", () => {
    const pcm = floatTo16BitPcm(new Float32Array([0, 0.5, -0.5, 1]));
    const bytes = wavBytesFromPcm(pcm, 1, 44100);
    const ascii = String.fromCharCode(...bytes.subarray(0, 12));
    assert.equal(ascii.slice(0, 4), "RIFF");
    assert.equal(ascii.slice(8, 12), "WAVE");
    assert.equal(bytes.length, 44 + pcm.byteLength);
  });

  it("clamps samples into int16", () => {
    const pcm = floatTo16BitPcm(new Float32Array([2, -2, 0]));
    assert.equal(pcm[0], 32767);
    assert.equal(pcm[1], -32768);
    assert.equal(pcm[2], 0);
  });
});
