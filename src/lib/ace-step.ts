import { z } from "zod";

/**
 * ACE-Step music generation (text → full song). This is NOT Demucs.
 *
 * Demucs (old Mashup Pro / `main`) splits a mix into stems. After Hours
 * Generate and AI Remix do not use it. Mashup is a client bounce of two
 * owned tracks and also does not need Demucs or ACE-Step.
 *
 * Default backend: Replicate. John only needs `REPLICATE_API_TOKEN` on
 * Vercel Production. `ACE_STEP_*` is optional and unused in production.
 *
 * Optional override: `ACE_STEP_BASE_URL` for a self-hosted OpenAI-compat host
 * (`/v1/chat/completions` returning a data-URL). If that env is set, it wins.
 *
 * Default model: `fishaudio/ace-step-1.5` (prompt / lyrics / duration / bpm).
 * Older v1 `lucataco/ace-step` is supported via `ACE_STEP_REPLICATE_MODEL`.
 */

export const AceStepJobSchema = z.object({
  /** Style caption for ACE-Step (genre, instruments, mood, production). */
  caption: z.string().min(8).max(1200),
  /** Lyrics with [Verse]/[Chorus] tags, or [Instrumental] / [inst]. */
  lyrics: z.string().max(8000).default("[Instrumental]"),
  bpm: z.number().min(60).max(200).optional(),
  durationSec: z.number().min(15).max(240).optional(),
  vocalLanguage: z.string().max(8).default("en"),
  instrumental: z.boolean().default(true),
  /** Short user-facing line about what will be generated. */
  summary: z.string().max(280),
});
export type AceStepJob = z.infer<typeof AceStepJobSchema>;

export type AceStepResult = {
  audioBase64: string;
  mime: string;
  bpm?: number;
  durationSec?: number;
  caption?: string;
};

export type AceStepBackend = "host" | "replicate" | "none";

export const DEFAULT_REPLICATE_MODEL = "fishaudio/ace-step-1.5";
export const DEFAULT_HOST_MODEL = "acestep/ACE-Step-v1.5";

type EnvBag = NodeJS.ProcessEnv | Record<string, string | undefined>;

function envOf(
  env: EnvBag = process.env,
): Record<string, string | undefined> {
  return env;
}

export function replicateToken(env: EnvBag = process.env): string {
  return envOf(env).REPLICATE_API_TOKEN?.trim() || "";
}

export function aceStepHostUrl(env: EnvBag = process.env): string {
  return (envOf(env).ACE_STEP_BASE_URL ?? "").replace(/\/+$/, "");
}

export function replicateModelId(env: EnvBag = process.env): string {
  return (
    envOf(env).ACE_STEP_REPLICATE_MODEL?.trim() || DEFAULT_REPLICATE_MODEL
  );
}

export function aceStepBackend(env: EnvBag = process.env): AceStepBackend {
  if (aceStepHostUrl(env)) return "host";
  if (replicateToken(env)) return "replicate";
  return "none";
}

export function aceStepConfigured(env: EnvBag = process.env): boolean {
  return aceStepBackend(env) !== "none";
}

export function jobLyrics(job: AceStepJob): string {
  if (job.instrumental) return job.lyrics?.trim() || "[Instrumental]";
  return job.lyrics || "[Instrumental]";
}

export function jobDurationSec(job: AceStepJob): number {
  return Math.round(Math.min(240, Math.max(15, job.durationSec ?? 60)));
}

/**
 * Map an ACE-Step job onto Replicate model inputs.
 * ACE-Step 1.5 uses prompt/lyrics/duration; lucataco/ace-step uses tags.
 */
export function replicateInputForJob(
  job: AceStepJob,
  model = DEFAULT_REPLICATE_MODEL,
): Record<string, unknown> {
  const lyrics = jobLyrics(job).slice(0, 4096);
  const duration = jobDurationSec(job);
  const caption = job.caption.slice(0, 512);
  const looksV1 =
    /lucataco/i.test(model) ||
    (/ace-step$/i.test(model) && !/1\.5/.test(model));
  if (looksV1) {
    return {
      tags: caption,
      lyrics,
      duration,
    };
  }
  return {
    prompt: caption,
    lyrics,
    duration,
    ...(job.bpm ? { bpm: Math.round(job.bpm) } : {}),
    audio_format: "mp3",
    thinking: true,
  };
}

function isAudioDeliveryUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("data:audio");
}

export function audioUrlFromReplicateOutput(output: unknown): string | null {
  if (typeof output === "string") {
    return isAudioDeliveryUrl(output) ? output : null;
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      const found = audioUrlFromReplicateOutput(item);
      if (found) return found;
    }
    return null;
  }
  if (output && typeof output === "object") {
    const rec = output as Record<string, unknown>;
    for (const key of ["url", "audio", "song", "file", "music"]) {
      if (key in rec) {
        const found = audioUrlFromReplicateOutput(rec[key]);
        if (found) return found;
      }
    }
  }
  return null;
}

export function mimeFromAudioUrl(url: string, fallback = "audio/mpeg"): string {
  const path = url.split("?")[0] ?? url;
  if (/\.wav$/i.test(path)) return "audio/wav";
  if (/\.ogg$/i.test(path)) return "audio/ogg";
  if (/\.flac$/i.test(path)) return "audio/flac";
  if (/\.(m4a|mp4|aac)$/i.test(path)) return "audio/mp4";
  if (/\.mp3$/i.test(path)) return "audio/mpeg";
  return fallback;
}

function hostAuthHeaders(env: EnvBag = process.env): HeadersInit {
  const key = envOf(env).ACE_STEP_API_KEY?.trim();
  return {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function hostModelId(env: EnvBag = process.env): string {
  return envOf(env).ACE_STEP_MODEL?.trim() || DEFAULT_HOST_MODEL;
}

async function generateViaHost(
  job: AceStepJob,
  env: EnvBag = process.env,
): Promise<AceStepResult> {
  const root = aceStepHostUrl(env);
  if (!root) throw new Error("ACE-Step is not configured.");

  const lyrics = jobLyrics(job);
  const content = `<prompt>${job.caption}</prompt><lyrics>${lyrics}</lyrics>`;

  const res = await fetch(`${root}/v1/chat/completions`, {
    method: "POST",
    headers: hostAuthHeaders(env),
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: hostModelId(env),
      messages: [{ role: "user", content }],
      stream: false,
      thinking: true,
      use_format: false,
      audio_config: {
        duration: jobDurationSec(job),
        bpm: job.bpm,
        format: "mp3",
        vocal_language: job.vocalLanguage ?? "en",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ACE-Step failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    choices?: {
      message?: {
        content?: string;
        audio?: { type?: string; audio_url?: { url?: string } }[];
      };
    }[];
  };
  const message = json.choices?.[0]?.message;
  const dataUrl = message?.audio?.[0]?.audio_url?.url;
  if (!dataUrl?.startsWith("data:")) {
    throw new Error("ACE-Step returned no audio.");
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("ACE-Step audio encoding was invalid.");

  return {
    mime: match[1] || "audio/mpeg",
    audioBase64: match[2] || "",
    bpm: job.bpm,
    durationSec: job.durationSec,
    caption: job.caption,
  };
}

type ReplicatePrediction = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: { get?: string };
};

async function replicateRequest(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<ReplicatePrediction> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text().catch(() => "");
  let json: ReplicatePrediction = {};
  try {
    json = text ? (JSON.parse(text) as ReplicatePrediction) : {};
  } catch {
    json = {};
  }
  if (res.status === 401) {
    throw new Error("REPLICATE_API_TOKEN was rejected. Check the token on this deploy.");
  }
  if (res.status === 402) {
    throw new Error(
      "Replicate billing needs a payment method. Add one on replicate.com, then retry.",
    );
  }
  if (!res.ok) {
    const detail =
      (typeof json.error === "string" && json.error) || text.slice(0, 220);
    throw new Error(
      `Replicate ACE-Step failed (${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return json;
}

async function pollPrediction(
  getUrl: string,
  token: string,
  timeoutMs = 240_000,
): Promise<ReplicatePrediction> {
  const started = Date.now();
  let delay = 2_000;
  while (Date.now() - started < timeoutMs) {
    const pred = await replicateRequest(getUrl, token, {
      method: "GET",
      signal: AbortSignal.timeout(30_000),
    });
    if (pred.status === "succeeded" || pred.status === "failed" || pred.status === "canceled") {
      return pred;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(8_000, delay + 500);
  }
  throw new Error("The generator timed out waiting for Replicate.");
}

async function audioFromDelivery(
  url: string,
): Promise<{ audioBase64: string; mime: string }> {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("ACE-Step audio encoding was invalid.");
    return { mime: match[1] || "audio/mpeg", audioBase64: match[2] || "" };
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`ACE-Step returned no audio (${res.status}).`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 800) {
    throw new Error("ACE-Step returned no audio.");
  }
  const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
  const mime =
    headerMime && headerMime.startsWith("audio/")
      ? headerMime
      : mimeFromAudioUrl(url);
  return { audioBase64: buf.toString("base64"), mime };
}

async function generateViaReplicate(
  job: AceStepJob,
  env: EnvBag = process.env,
): Promise<AceStepResult> {
  const token = replicateToken(env);
  if (!token) {
    throw new Error(
      "ACE-Step is not configured. Set REPLICATE_API_TOKEN (or ACE_STEP_BASE_URL).",
    );
  }
  const model = replicateModelId(env);
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    throw new Error(
      "ACE_STEP_REPLICATE_MODEL must look like owner/name (default fishaudio/ace-step-1.5).",
    );
  }
  const owner = model.slice(0, slash);
  const name = model.slice(slash + 1);
  const created = await replicateRequest(
    `https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`,
    token,
    {
      method: "POST",
      headers: { Prefer: "wait=60" },
      signal: AbortSignal.timeout(75_000),
      body: JSON.stringify({ input: replicateInputForJob(job, model) }),
    },
  );

  let pred = created;
  if (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
    const getUrl = pred.urls?.get;
    if (!getUrl) {
      throw new Error("Replicate did not return a prediction URL.");
    }
    pred = await pollPrediction(getUrl, token);
  }

  if (pred.status === "canceled") {
    throw new Error("The generator timed out.");
  }
  if (pred.status === "failed") {
    const err =
      typeof pred.error === "string"
        ? pred.error
        : pred.error
          ? JSON.stringify(pred.error).slice(0, 200)
          : "";
    throw new Error(
      `ACE-Step failed on Replicate${err ? `: ${err}` : "."}`,
    );
  }

  const audioUrl = audioUrlFromReplicateOutput(pred.output);
  if (!audioUrl) {
    throw new Error("ACE-Step returned no audio.");
  }
  const audio = await audioFromDelivery(audioUrl);
  return {
    ...audio,
    bpm: job.bpm,
    durationSec: job.durationSec,
    caption: job.caption,
  };
}

/** Generate audio via Replicate (default) or a self-hosted ACE-Step host. */
export async function generateWithAceStep(
  job: AceStepJob,
  env: EnvBag = process.env,
): Promise<AceStepResult> {
  const backend = aceStepBackend(env);
  if (backend === "none") {
    throw new Error(
      "ACE-Step is not configured. Set REPLICATE_API_TOKEN (or ACE_STEP_BASE_URL).",
    );
  }
  if (backend === "host") return generateViaHost(job, env);
  return generateViaReplicate(job, env);
}

/** Decode ACE-Step base64 audio into an AudioBuffer in the booth context. */
export async function decodeAceStepAudio(
  ctx: AudioContext | OfflineAudioContext,
  result: AceStepResult,
): Promise<AudioBuffer> {
  const binary = atob(result.audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return ctx.decodeAudioData(bytes.buffer.slice(0));
}
