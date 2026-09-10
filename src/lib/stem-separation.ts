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
  if (!response.ok || !payload?.urls?.get) {
    throw new Error(payload?.error || "Could not upload the song for stem separation.");
  }
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
  if (prediction.status !== "succeeded" || !prediction.output) {
    throw new Error(prediction.error || `Stem separation ${prediction.status}.`);
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(prediction.output)) if (typeof value === "string") out[key] = value;
  if (!out.vocals) throw new Error("Demucs did not return a vocal stem.");
  return out;
}

export async function separateSong(file: File, signal?: AbortSignal) {
  const audio = await uploadSong(file, signal);
  return waitForPrediction(await createPrediction(audio, signal), signal);
}

async function decodeUrl(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Could not download a separated stem.");
  const bytes = await response.arrayBuffer();
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(bytes.slice(0));
  } finally {
    void context.close();
  }
}

export async function decodeVocalStem(stems: Record<string, string>, signal?: AbortSignal) {
  return decodeUrl(stems.vocals, signal);
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
    const source = offline.createBufferSource();
    source.buffer = part;
    source.connect(offline.destination);
    source.start(0);
  }
  return offline.startRendering();
}

export async function makeAutomaticMashupStems(songA: File, songB: File, signal?: AbortSignal) {
  const [a, b] = await Promise.all([separateSong(songA, signal), separateSong(songB, signal)]);
  const [instrumentalA, vocalsB] = await Promise.all([
    decodeInstrumentalStem(a, signal),
    decodeVocalStem(b, signal),
  ]);
  return { instrumentalA, vocalsB };
}
