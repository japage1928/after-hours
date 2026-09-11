import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  downloadExtension,
  idsToEvict,
  nextGrooveStyle,
  parseLibraryHandoff,
} from "./track-library.ts";

describe("track library helpers", () => {
  it("evicts oldest ids past the cap", () => {
    const rows = [
      { id: "a", createdAt: 1 },
      { id: "b", createdAt: 3 },
      { id: "c", createdAt: 2 },
    ];
    assert.deepEqual(idsToEvict(rows, 2), ["a"]);
    assert.deepEqual(idsToEvict(rows, 8), []);
  });

  it("rotates groove styles", () => {
    assert.equal(nextGrooveStyle("edm"), "dubstep");
    assert.equal(nextGrooveStyle("breaks"), "edm");
    assert.equal(nextGrooveStyle("nope"), "edm");
  });

  it("parses remix and generate handoffs", () => {
    assert.equal(parseLibraryHandoff(null), null);
    assert.equal(parseLibraryHandoff("{"), null);
    const remix = parseLibraryHandoff(
      JSON.stringify({ kind: "remix-source", trackId: "trk_1", style: "rock" }),
    );
    assert.deepEqual(remix, {
      kind: "remix-source",
      trackId: "trk_1",
      style: "rock",
    });
    const gen = parseLibraryHandoff(
      JSON.stringify({
        kind: "generate-again",
        prompt: "Night drive",
        style: "pop",
        lyrics: "go",
      }),
    );
    assert.equal(gen?.kind, "generate-again");
    if (gen?.kind === "generate-again") {
      assert.equal(gen.prompt, "Night drive");
      assert.equal(gen.style, "pop");
    }
  });

  it("picks a download extension from mime", () => {
    assert.equal(downloadExtension("audio/wav"), "wav");
    assert.equal(downloadExtension("audio/mpeg"), "mp3");
    assert.equal(downloadExtension("audio/mp4"), "m4a");
  });
});
