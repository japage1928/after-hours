import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIO_FILE_ACCEPT,
  audioDecodeErrorMessage,
  classifyAudioFile,
  displayTrackName,
} from "./audio-file.ts";

function file(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("classifyAudioFile", () => {
  it("accepts normal audio MIME and extensions", () => {
    assert.equal(classifyAudioFile(file("cut.mp3", "audio/mpeg")), "yes");
    assert.equal(classifyAudioFile(file("memo.m4a", "audio/mp4")), "yes");
    assert.equal(classifyAudioFile(file("memo.m4a", "audio/x-m4a")), "yes");
    assert.equal(classifyAudioFile(file("loop.wav", "")), "yes");
  });

  it("treats iPhone empty-type and mp4-labeled audio as maybe", () => {
    assert.equal(classifyAudioFile(file("Recording", "")), "maybe");
    assert.equal(classifyAudioFile(file("track", "application/octet-stream")), "maybe");
    assert.equal(classifyAudioFile(file("song.m4a", "video/mp4")), "yes");
    assert.equal(classifyAudioFile(file("Recording", "video/mp4")), "maybe");
  });

  it("rejects clear non-audio", () => {
    assert.equal(classifyAudioFile(file("pic.jpg", "image/jpeg")), "no");
    assert.equal(classifyAudioFile(file("clip.mov", "video/quicktime")), "no");
    assert.equal(classifyAudioFile(file("clip.webm", "video/webm")), "no");
    assert.equal(classifyAudioFile(file("notes.pdf", "application/pdf")), "no");
  });
});

describe("displayTrackName", () => {
  it("strips extension and handles blank names", () => {
    assert.equal(displayTrackName(file("Night Drive.m4a", "audio/mp4")), "Night Drive");
    assert.equal(displayTrackName(file("", "audio/mpeg")), "Uploaded track");
  });
});

describe("AUDIO_FILE_ACCEPT", () => {
  it("includes iPhone-friendly types", () => {
    assert.match(AUDIO_FILE_ACCEPT, /audio\/\*/);
    assert.match(AUDIO_FILE_ACCEPT, /\.m4a/);
    assert.match(AUDIO_FILE_ACCEPT, /audio\/x-m4a/);
  });
});

describe("audioDecodeErrorMessage", () => {
  it("adds iPhone guidance", () => {
    const msg = audioDecodeErrorMessage(new Error("EncodingError"));
    assert.match(msg, /iPhone/);
    assert.match(msg, /M4A|MP3/);
  });
});
