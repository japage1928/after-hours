import type { Song } from "@/lib/types";
import { genreById } from "@/lib/genres";
import { vocalistById } from "@/lib/vocalists";
import { startN8nSongJob, waitForN8nJob } from "@/lib/n8n-orchestrator";

type Prediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string[] | string | null;
  error?: string | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function structuredLyrics(song: Song): string {
  return song.sections
    .map((section) => {
      const tag = section.kind.charAt(0).toUpperCase() + section.kind.slice(1);
      const lyrics = section.lyrics.trim();
      return lyrics ? `[${tag}]\n${lyrics}` : `[${tag}]\n[Instrumental]`;
    })
    .join("\n\n")
    .slice(0, 4096);
}

function productionPrompt(song: Song): string {
  const genre = genreById(song.genre).label;
  const voiceA = vocalistById(song.vocalistA);
  const voiceB = song.vocalistB ? vocalistById(song.vocalistB) : null;
  const voiceDescription = voiceB
    ? `duet vocals, ${voiceA.tone} lead with ${voiceB.tone} contrasting sections`
    : `${voiceA.tone} ${song.vocalMode} lead vocal`;
  return [
    genre,
    song.mood,
    voiceDescription,
    "polished commercial production, coherent full-song arrangement, strong memorable chorus, natural transitions, dynamic build and release",
    `tempo ${song.bpm} BPM, key ${song.key}`,
    song.prompt,
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 512);
}

function targetDuration(song: Song): number {
  const bars = song.sections.reduce((sum, section) => sum + section.bars, 0);
  const seconds = bars * 4 * (60 / song.bpm);
  return Math.max(20, Math.min(600, Math.round(seconds)));
}

async function decodeRemoteAudio(url: string, signal?: AbortSignal): Promise<AudioBuffer> {
  const audioResponse = await fetch(url, { signal });
  if (!audioResponse.ok) throw new Error("Could not download the generated song.");
  const bytes = await audioResponse.arrayBuffer();
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(bytes.slice(0));
  } finally {
    void context.close();
  }
}

async function generateThroughN8n(song: Song, signal?: AbortSignal): Promise<AudioBuffer> {
  const output = await waitForN8nJob(
    await startN8nSongJob(
      {
        prompt: productionPrompt(song),
        lyrics: structuredLyrics(song),
        duration: targetDuration(song),
        bpm: song.bpm,
        keyScale: song.key,
      },
      signal,
    ),
    "song",
    15 * 60_000,
    signal,
  );
  const url = Array.isArray(output) ? output[0] : output;
  if (!url) throw new Error("n8n music workflow returned no audio.");
  return decodeRemoteAudio(url, signal);
}

async function generateLegacy(song: Song, signal?: AbortSignal): Promise<AudioBuffer> {
  const response = await fetch("/api/song-generation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: productionPrompt(song),
      lyrics: structuredLyrics(song),
      duration: targetDuration(song),
      bpm: song.bpm,
      keyScale: song.key,
    }),
    signal,
  });
  let prediction = (await response.json().catch(() => null)) as Prediction | null;
  if (!response.ok || !prediction?.id) throw new Error(prediction?.error || "Could not start full-song generation.");

  const deadline = Date.now() + 15 * 60_000;
  while (prediction.status === "starting" || prediction.status === "processing") {
    signal?.throwIfAborted();
    if (Date.now() > deadline) throw new Error("Full-song generation timed out.");
    await sleep(2200);
    const poll = await fetch(`/api/song-generation?id=${encodeURIComponent(prediction.id)}`, { signal });
    prediction = (await poll.json().catch(() => null)) as Prediction;
    if (!poll.ok || !prediction?.status) throw new Error("Could not check music generation progress.");
  }
  if (prediction.status !== "succeeded" || !prediction.output) {
    throw new Error(prediction.error || `Music generation ${prediction.status}.`);
  }

  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!url) throw new Error("Music generator returned no audio.");
  return decodeRemoteAudio(url, signal);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function generateFullSong(song: Song, signal?: AbortSignal): Promise<AudioBuffer> {
  try {
    return await generateThroughN8n(song, signal);
  } catch (error) {
    if (signal?.aborted || isAbort(error)) throw error;
    console.warn("Mashup Pro n8n song generation failed; using temporary legacy fallback.", error);
    return generateLegacy(song, signal);
  }
}
