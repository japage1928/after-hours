import {
  startN8nStemJob,
  waitForN8nJob,
} from "@/lib/n8n-orchestrator";

type Prediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: Record<string, string | null> | null;
  error?: string | null;
};

type UploadedFile = { urls?: { get?: string } };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function uploadSong(file: File, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("content", file, file.name);
  form.append("metadata", JSON.stringify({ source: "mashup-pro" }));
  const response = await fetch("/api/stem-upload", { method: "POST", body: form, signal });
  const payload = (await response.json().catch(() => null)) as UploadedFile & { error?: string } | null;
  if (!response.ok || !payload?.urls?.get) throw new Error(payload?.error || "Could not upload the song for stem separation.");
  return payload.urls.get;
}

async function createPrediction(audio: string, signal?: AbortSignal): Promise<Prediction> {
  const response = await fetch("/api/stem-prediction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audio }),
    signal,
  });
  const payload = (await response.json().catch(() => null)) as Prediction & { error?: string } | null;
  if (!response.ok || !payload?.id) throw new Error(payload?.error || "Could not start Demucs.");
  return payload;
}

async function waitForPrediction(initial: Prediction, signal?: AbortSignal): Promise<Record<string, string>> {
  let prediction = initial;
  const deadline = Date.now() + 12 * 60_000;
  while (prediction.status === "starting" || prediction.status === "processing") {
    signal?.throwIfAborted();
    if (Date.now() > deadline) throw new Error("Stem separation timed out.");
    await sleep(1800);
    const response = await fetch(`/api/stem-prediction?id=${encodeURIComponent(prediction.id)}`, { signal });
    prediction = (await response.json().catch(() => null)) as Prediction;
    if (!response.ok || !prediction?.status) throw new Error("Could not check stem separation progress.");
  }
  if (prediction.status !== "succeeded" || !prediction.output) throw new Error(prediction.error || `Stem separation ${prediction.status}.`);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(prediction.output)) if (typeof value === "string") out[key] = value;
  if (!out.vocals) throw new Error("Demucs did not return a vocal stem.");
  return out;
}

async function separateSongLegacy(file: File, signal?: AbortSignal) {
  const audio = await uploadSong(file, signal);
  return waitForPrediction(await createPrediction(audio, signal), signal);
}

async function separateSongThroughN8n(file: File, signal?: AbortSignal) {
  const output = await waitForN8nJob(
    await startN8nStemJob(file, signal),
    "stems",
    12 * 60_000,
    signal,
  );
  if (!output.vocals) throw new Error("n8n stem workflow returned no vocal stem.");
  return output;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function separateSong(file: File, signal?: AbortSignal) {
  try {
    return await separateSongThroughN8n(file, signal);
  } catch (error) {
    if (signal?.aborted || isAbort(error)) throw error;
    console.warn("Mashup Pro n8n stem separation failed; using temporary legacy fallback.", error);
    return separateSongLegacy(file, signal);
  }
}

async function decodeUrl(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Could not download a separated stem.");
  const bytes = await response.arrayBuffer();
  const context = new AudioContext();
  try { return await context.decodeAudioData(bytes.slice(0)); }
  finally { void context.close(); }
}

export async function decodeVocalStem(stems: Record<string, string>, signal?: AbortSignal) {
  return decodeUrl(stems.vocals, signal);
}

async function decodeNamed(stems: Record<string, string>, name: string, signal?: AbortSignal) {
  const url = stems[name];
  return url ? decodeUrl(url, signal) : null;
}

export async function decodeInstrumentalStem(stems: Record<string, string>, signal?: AbortSignal) {
  const urls = [stems.drums, stems.bass, stems.other, stems.piano, stems.guitar].filter(Boolean);
  if (!urls.length) throw new Error("Demucs did not return instrumental stems.");
  const parts = await Promise.all(urls.map((url) => decodeUrl(url, signal)));
  signal?.throwIfAborted();
  const sampleRate = parts[0].sampleRate;
  const duration = Math.max(...parts.map((part) => part.duration));
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  for (const part of parts) {
    const source = offline.createBufferSource(); source.buffer = part; source.connect(offline.destination); source.start(0);
  }
  return offline.startRendering();
}

function scheduleStem(offline: OfflineAudioContext, buffer: AudioBuffer | null, gainValue: number, cue: number, outDur: number, automation?: (gain: AudioParam) => void) {
  if (!buffer || gainValue <= 0) return;
  const source = offline.createBufferSource();
  source.buffer = buffer;
  const gain = offline.createGain();
  gain.gain.value = gainValue;
  automation?.(gain.gain);
  source.connect(gain); gain.connect(offline.destination);
  source.start(0, Math.max(0, Math.min(cue, buffer.duration - 0.05)), Math.min(outDur, Math.max(0.05, buffer.duration - cue)));
}

export async function makeAutomaticRemixSource(song: File, bpm: number, cueSec: number, signal?: AbortSignal) {
  const stems = await separateSong(song, signal);
  const [vocals, drums, bass, other, piano, guitar] = await Promise.all([
    decodeNamed(stems, "vocals", signal), decodeNamed(stems, "drums", signal), decodeNamed(stems, "bass", signal),
    decodeNamed(stems, "other", signal), decodeNamed(stems, "piano", signal), decodeNamed(stems, "guitar", signal),
  ]);
  signal?.throwIfAborted();
  const parts = [vocals, drums, bass, other, piano, guitar].filter((x): x is AudioBuffer => Boolean(x));
  if (!parts.length || !vocals) throw new Error("Demucs did not return enough stems for a remix.");
  const safeBpm = Math.max(72, Math.min(178, bpm || 120));
  const bar = (60 / safeBpm) * 4;
  const cue = Math.max(0, cueSec || 0);
  const available = Math.max(0, Math.min(...parts.map((p) => p.duration)) - cue);
  const bars = Math.min(32, Math.floor(available / bar));
  if (bars < 8) throw new Error("Choose a cue point with at least 8 bars remaining for the remix.");
  const outDur = bars * bar;
  const sr = parts[0].sampleRate;
  const offline = new OfflineAudioContext(2, Math.ceil(outDur * sr), sr);
  const introEnd = Math.min(outDur, 4 * bar);
  const breakStart = Math.min(outDur, 16 * bar);
  const breakEnd = Math.min(outDur, 20 * bar);
  const outroStart = Math.max(0, outDur - 4 * bar);

  scheduleStem(offline, other, 0.78, cue, outDur);
  scheduleStem(offline, piano, 0.72, cue, outDur);
  scheduleStem(offline, guitar, 0.72, cue, outDur);
  scheduleStem(offline, bass, 0.86, cue, outDur, (g) => {
    g.setValueAtTime(0.38, 0); g.linearRampToValueAtTime(0.86, introEnd);
    if (breakEnd > breakStart) { g.setValueAtTime(0.86, breakStart); g.linearRampToValueAtTime(0.28, breakStart + bar); g.linearRampToValueAtTime(0.86, breakEnd); }
  });
  scheduleStem(offline, drums, 0.92, cue, outDur, (g) => {
    g.setValueAtTime(0.20, 0); g.linearRampToValueAtTime(0.92, introEnd);
    if (breakEnd > breakStart) { g.setValueAtTime(0.92, breakStart); g.linearRampToValueAtTime(0.08, breakStart + bar); g.setValueAtTime(0.08, breakEnd - bar); g.linearRampToValueAtTime(0.92, breakEnd); }
    g.setValueAtTime(0.92, outroStart); g.linearRampToValueAtTime(0.55, outDur);
  });
  scheduleStem(offline, vocals, 0.92, cue, outDur, (g) => {
    g.setValueAtTime(0, 0); g.setValueAtTime(0, Math.max(0, introEnd - 0.05)); g.linearRampToValueAtTime(0.92, introEnd + 0.25);
    g.setValueAtTime(0.92, outroStart); g.linearRampToValueAtTime(0, Math.min(outDur, outroStart + 2 * bar));
  });

  return offline.startRendering();
}

export async function makeAutomaticMashupStems(songA: File, songB: File, signal?: AbortSignal) {
  const [a, b] = await Promise.all([separateSong(songA, signal), separateSong(songB, signal)]);
  const [instrumentalA, vocalsB] = await Promise.all([decodeInstrumentalStem(a, signal), decodeVocalStem(b, signal)]);
  return { instrumentalA, vocalsB };
}
