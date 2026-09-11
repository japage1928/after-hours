import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fallbackAceStepJob, remixBedDurationSec } from "./remix-job.ts";

describe("remixBedDurationSec", () => {
  it("matches the source song between 32s and 90s", () => {
    assert.equal(remixBedDurationSec(10), 32);
    assert.equal(remixBedDurationSec(48), 48);
    assert.equal(remixBedDurationSec(200), 90);
  });
});

describe("fallbackAceStepJob", () => {
  it("asks ACE-Step for a full-listen instrumental bed", () => {
    const job = fallbackAceStepJob({
      brief: "dubstep drop, keep my vocal",
      genre: "dubstep",
      songName: "Night Drive",
      songBpm: 140,
      songDurationSec: 180,
      instrumental: true,
    });
    assert.equal(job.instrumental, true);
    assert.equal(job.lyrics, "[Instrumental]");
    assert.equal(job.durationSec, 90);
    assert.match(job.caption, /Dubstep/i);
  });
});
