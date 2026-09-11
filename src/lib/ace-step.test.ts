import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aceStepBackend,
  aceStepConfigured,
  audioUrlFromReplicateOutput,
  mimeFromAudioUrl,
  replicateInputForJob,
  replicateModelId,
} from "./ace-step.ts";
import type { AceStepJob } from "./ace-step.ts";

const job: AceStepJob = {
  caption: "Night-drive synth-pop, warm bass, bright chorus, original vocal",
  lyrics: "[Verse]\nCity lights\n[Chorus]\nDrive home",
  bpm: 102,
  durationSec: 60,
  vocalLanguage: "en",
  instrumental: false,
  summary: "Pop: night drive",
};

describe("ACE-Step backend selection", () => {
  it("prefers a self-hosted ACE_STEP_BASE_URL over Replicate", () => {
    assert.equal(
      aceStepBackend({
        ACE_STEP_BASE_URL: "https://host.example",
        REPLICATE_API_TOKEN: "r8_x",
      }),
      "host",
    );
  });

  it("uses Replicate when only REPLICATE_API_TOKEN is set", () => {
    assert.equal(aceStepBackend({ REPLICATE_API_TOKEN: "r8_x" }), "replicate");
    assert.equal(aceStepConfigured({ REPLICATE_API_TOKEN: "r8_x" }), true);
    assert.equal(aceStepConfigured({}), false);
  });

  it("defaults to fishaudio/ace-step-1.5", () => {
    assert.equal(replicateModelId({}), "fishaudio/ace-step-1.5");
    assert.equal(
      replicateModelId({ ACE_STEP_REPLICATE_MODEL: "lucataco/ace-step" }),
      "lucataco/ace-step",
    );
  });
});

describe("Replicate input mapping", () => {
  it("sends prompt/lyrics/duration for ACE-Step 1.5", () => {
    const input = replicateInputForJob(job, "fishaudio/ace-step-1.5");
    assert.equal(input.prompt, job.caption);
    assert.equal(input.lyrics, job.lyrics);
    assert.equal(input.duration, 60);
    assert.equal(input.bpm, 102);
    assert.equal(input.audio_format, "mp3");
  });

  it("sends tags for lucataco/ace-step v1", () => {
    const input = replicateInputForJob(job, "lucataco/ace-step");
    assert.equal(input.tags, job.caption);
    assert.equal(input.lyrics, job.lyrics);
    assert.equal(input.prompt, undefined);
  });

  it("uses [Instrumental] when the job is instrumental", () => {
    const input = replicateInputForJob(
      { ...job, instrumental: true, lyrics: "" },
      "fishaudio/ace-step-1.5",
    );
    assert.equal(input.lyrics, "[Instrumental]");
  });
});

describe("Replicate output parsing", () => {
  it("reads a string URL or a list of URLs", () => {
    assert.equal(
      audioUrlFromReplicateOutput("https://replicate.delivery/song.mp3"),
      "https://replicate.delivery/song.mp3",
    );
    assert.equal(
      audioUrlFromReplicateOutput(["https://replicate.delivery/a.mp3"]),
      "https://replicate.delivery/a.mp3",
    );
    assert.equal(audioUrlFromReplicateOutput(null), null);
  });

  it("guesses mime from the delivery URL", () => {
    assert.equal(mimeFromAudioUrl("https://x/file.mp3"), "audio/mpeg");
    assert.equal(mimeFromAudioUrl("https://x/file.wav?sig=1"), "audio/wav");
  });
});
