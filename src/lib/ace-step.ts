import { z } from "zod";

/**
 * ACE-Step music generation client.
 *
 * Env:
 * - ACE_STEP_BASE_URL — e.g. https://your-host (no trailing slash)
 * - ACE_STEP_API_KEY — optional bearer token
 * - ACE_STEP_MODEL — default acestep/ACE-Step-v1.5
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

export function aceStepConfigured(): boolean {
  return Boolean(process.env.ACE_STEP_BASE_URL?.trim());
}

function baseUrl(): string {
  return (process.env.ACE_STEP_BASE_URL ?? "").replace(/\/+$/, "");
}

function authHeaders(): HeadersInit {
  const key = process.env.ACE_STEP_API_KEY?.trim();
  return {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function modelId(): string {
  return process.env.ACE_STEP_MODEL?.trim() || "acestep/ACE-Step-v1.5";
}

/** Prefer OpenAI-compatible /v1/chat/completions when available. */
export async function generateWithAceStep(
  job: AceStepJob,
): Promise<AceStepResult> {
  const root = baseUrl();
  if (!root) throw new Error("ACE-Step is not configured.");

  const lyrics = job.instrumental
    ? job.lyrics?.trim() || "[Instrumental]"
    : job.lyrics;
  const content = `<prompt>${job.caption}</prompt><lyrics>${lyrics}</lyrics>`;

  const res = await fetch(`${root}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: modelId(),
      messages: [{ role: "user", content }],
      stream: false,
      thinking: true,
      use_format: false,
      audio_config: {
        duration: job.durationSec ?? 60,
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
