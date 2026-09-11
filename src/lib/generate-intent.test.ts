import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fallbackGenerateJob, taggedLyrics } from "./generate-job.ts";

describe("taggedLyrics", () => {
  it("wraps plain lyrics in verse/chorus", () => {
    const out = taggedLyrics("line one\nline two\nline three", "ignored");
    assert.match(out, /\[Verse\]/);
    assert.match(out, /\[Chorus\]/);
    assert.match(out, /line one/);
  });

  it("keeps existing section tags", () => {
    const raw = "[Verse]\nhello\n[Chorus]\nworld";
    assert.equal(taggedLyrics(raw, "x"), raw);
  });

  it("falls back to the prompt when lyrics are empty", () => {
    const out = taggedLyrics("", "night train home");
    assert.match(out, /night train home/);
  });
});

describe("fallbackGenerateJob", () => {
  it("builds an ACE-Step-shaped vocal job", () => {
    const job = fallbackGenerateJob({
      prompt: "Late-night synth-pop about a last train",
      style: "pop",
      lyrics: "",
      durationSec: 60,
      instrumental: false,
    });
    assert.equal(job.instrumental, false);
    assert.match(job.lyrics, /\[Verse\]/);
    assert.equal(job.durationSec, 60);
    assert.match(job.caption, /Pop/i);
    assert.ok(job.caption.length >= 12);
  });

  it("uses [Instrumental] when asked and no lyrics pasted", () => {
    const job = fallbackGenerateJob({
      prompt: "cinematic drums",
      style: "edm",
      lyrics: "",
      durationSec: 30,
      instrumental: true,
    });
    assert.equal(job.instrumental, true);
    assert.equal(job.lyrics, "[Instrumental]");
  });

  it("prefers pasted lyrics over the instrumental flag", () => {
    const job = fallbackGenerateJob({
      prompt: "story song",
      style: "country",
      lyrics: "I drove all night",
      durationSec: 90,
      instrumental: true,
    });
    assert.equal(job.instrumental, false);
    assert.match(job.lyrics, /I drove all night/);
  });
});
