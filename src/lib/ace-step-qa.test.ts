import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeVerdicts,
  qaAceStepJob,
  qaAceStepRaw,
} from "./ace-step-qa.ts";
import type { AceStepJob, AceStepResult } from "./ace-step.ts";

function job(partial: Partial<AceStepJob> = {}): AceStepJob {
  return {
    caption: "EDM festival remix, big clap, rolling bass, clean kick",
    lyrics: "[Instrumental]",
    bpm: 128,
    durationSec: 48,
    vocalLanguage: "en",
    instrumental: true,
    summary: "EDM remix bed",
    ...partial,
  };
}

describe("ACE-Step job QA", () => {
  it("passes a normal instrumental brief", () => {
    const v = qaAceStepJob(job(), "edm festival drop");
    assert.equal(v.ok, true);
  });

  it("rejects thin captions", () => {
    const v = qaAceStepJob(job({ caption: "short" }));
    assert.equal(v.ok, false);
    assert.match(v.reasons.join(" "), /thin/i);
  });

  it("rejects clone-style prompts", () => {
    const v = qaAceStepJob(
      job({ caption: "exact replica of a famous hit, cover of the radio edit" }),
    );
    assert.equal(v.ok, false);
  });
});

describe("ACE-Step raw QA", () => {
  it("rejects tiny payloads", () => {
    const result: AceStepResult = {
      audioBase64: "aaaa",
      mime: "audio/mpeg",
    };
    const v = qaAceStepRaw(result);
    assert.equal(v.ok, false);
  });

  it("passes a large-enough payload", () => {
    const result: AceStepResult = {
      audioBase64: "a".repeat(20_000),
      mime: "audio/mpeg",
    };
    const v = qaAceStepRaw(result);
    assert.equal(v.ok, true);
  });
});

describe("mergeVerdicts", () => {
  it("fails if any part fails", () => {
    const v = mergeVerdicts(
      { ok: true, reasons: [] },
      { ok: false, reasons: ["nope"] },
    );
    assert.equal(v.ok, false);
    assert.deepEqual(v.reasons, ["nope"]);
  });
});
