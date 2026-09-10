export type N8nJobStatus = "queued" | "starting" | "processing" | "succeeded" | "failed" | "canceled";

export type N8nJob<T = unknown> = {
  jobId: string;
  status: N8nJobStatus;
  output?: T | null;
  error?: string | null;
};

export class N8nNotConfiguredError extends Error {
  constructor() {
    super("n8n backend is not configured.");
    this.name = "N8nNotConfiguredError";
  }
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function ensureConfigured(response: Response) {
  if (response.status === 503 && response.headers.get("x-mashup-backend") === "unconfigured") {
    throw new N8nNotConfiguredError();
  }
}

export async function startN8nSongJob(
  payload: {
    prompt: string;
    lyrics: string;
    duration: number;
    bpm: number;
    keyScale: string;
  },
  signal?: AbortSignal,
): Promise<N8nJob<string | string[]>> {
  const response = await fetch("/api/orchestrate/song", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  ensureConfigured(response);
  const data = await parseJson<N8nJob<string | string[]> & { error?: string }>(response);
  if (!response.ok || !data?.jobId) throw new Error(data?.error || `n8n song job failed (${response.status}).`);
  return data;
}

export async function startN8nStemJob(file: File, signal?: AbortSignal): Promise<N8nJob<Record<string, string>>> {
  const form = new FormData();
  form.append("audio", file, file.name);
  form.append("operation", "stems");
  const response = await fetch("/api/orchestrate/remix", {
    method: "POST",
    body: form,
    signal,
  });
  ensureConfigured(response);
  const data = await parseJson<N8nJob<Record<string, string>> & { error?: string }>(response);
  if (!response.ok || !data?.jobId) throw new Error(data?.error || `n8n stem job failed (${response.status}).`);
  return data;
}

export async function pollN8nJob<T>(jobId: string, type: "song" | "stems", signal?: AbortSignal): Promise<N8nJob<T>> {
  const response = await fetch(
    `/api/orchestrate/status?id=${encodeURIComponent(jobId)}&type=${encodeURIComponent(type)}`,
    { signal },
  );
  ensureConfigured(response);
  const data = await parseJson<N8nJob<T> & { error?: string }>(response);
  if (!response.ok || !data?.jobId || !data.status) {
    throw new Error(data?.error || `Could not check n8n job (${response.status}).`);
  }
  return data;
}

export async function waitForN8nJob<T>(
  initial: N8nJob<T>,
  type: "song" | "stems",
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  let job = initial;
  const deadline = Date.now() + timeoutMs;
  while (job.status === "queued" || job.status === "starting" || job.status === "processing") {
    signal?.throwIfAborted();
    if (Date.now() > deadline) throw new Error(`${type === "song" ? "Song generation" : "Stem separation"} timed out.`);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    job = await pollN8nJob<T>(job.jobId, type, signal);
  }
  if (job.status !== "succeeded" || job.output == null) {
    throw new Error(job.error || `${type === "song" ? "Song generation" : "Stem separation"} ${job.status}.`);
  }
  return job.output;
}
