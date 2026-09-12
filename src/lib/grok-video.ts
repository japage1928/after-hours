import { z } from "zod";

/**
 * Thin Grok Imagine video client (xAI REST).
 *
 * xAI can render video today: POST /v1/videos/generations → poll
 * GET /v1/videos/{request_id} → download the returned MP4 URL.
 * Prompt expansion + QA stay on grok-4.5 chat. There is no second
 * video vendor and no n8n hop — inactive Video Studio workflows
 * would add a webhook without simplifying this path.
 */

export const VIDEO_ASPECTS = ["16:9", "9:16", "1:1"] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];

export const VIDEO_DURATIONS = [4, 8, 12] as const;
export type VideoDurationSec = (typeof VIDEO_DURATIONS)[number];

export const DEFAULT_VIDEO_MODEL = "grok-imagine-video-1.5";
export const DEFAULT_VIDEO_RESOLUTION = "720p";
export const DEFAULT_VIDEO_DURATION_SEC = 8;
export const DEFAULT_VIDEO_ASPECT: VideoAspect = "16:9";

export const VideoJobSchema = z.object({
  prompt: z.string().min(12).max(2000),
  durationSec: z.number().min(1).max(15),
  aspectRatio: z.enum(VIDEO_ASPECTS),
  resolution: z.enum(["480p", "720p", "1080p"]).default(DEFAULT_VIDEO_RESOLUTION),
  summary: z.string().max(280),
});
export type VideoJob = z.infer<typeof VideoJobSchema>;

export type GrokVideoResult = {
  videoBase64: string;
  mime: string;
  durationSec: number;
  prompt: string;
  summary: string;
  requestId: string;
  model: string;
  respectModeration: boolean;
  byteLength: number;
};

type EnvBag = NodeJS.ProcessEnv | Record<string, string | undefined>;

function envOf(env: EnvBag = process.env): Record<string, string | undefined> {
  return env;
}

export function xaiApiKey(env: EnvBag = process.env): string {
  return envOf(env).XAI_API_KEY?.trim() || "";
}

export function grokVideoModel(env: EnvBag = process.env): string {
  return envOf(env).XAI_VIDEO_MODEL?.trim() || DEFAULT_VIDEO_MODEL;
}

export function grokVideoConfigured(env: EnvBag = process.env): boolean {
  return Boolean(xaiApiKey(env));
}

export function clampVideoDuration(sec: number): number {
  return Math.round(Math.min(15, Math.max(1, sec)));
}

export function isVideoAspect(value: string): value is VideoAspect {
  return (VIDEO_ASPECTS as readonly string[]).includes(value);
}

export function bytesFromBase64(base64: string): number {
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function mimeFromVideoUrl(url: string, fallback = "video/mp4"): string {
  const path = url.split("?")[0] ?? url;
  if (/\.webm$/i.test(path)) return "video/webm";
  if (/\.mov$/i.test(path)) return "video/quicktime";
  if (/\.mp4$/i.test(path)) return "video/mp4";
  return fallback;
}

type VideoPollBody = {
  status?: string;
  progress?: number | null;
  model?: string | null;
  error?: { code?: string; message?: string };
  video?: {
    url?: string | null;
    duration?: number;
    respect_moderation?: boolean;
  };
};

function xaiHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function startGrokVideo(
  job: VideoJob,
  env: EnvBag = process.env,
): Promise<{ requestId: string }> {
  const apiKey = xaiApiKey(env);
  if (!apiKey) {
    throw new Error("Video needs XAI_API_KEY. Add it on this deploy, then retry.");
  }
  const res = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: xaiHeaders(apiKey),
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: grokVideoModel(env),
      prompt: job.prompt,
      duration: clampVideoDuration(job.durationSec),
      aspect_ratio: job.aspectRatio,
      resolution: job.resolution ?? DEFAULT_VIDEO_RESOLUTION,
    }),
  });
  const text = await res.text().catch(() => "");
  let json: { request_id?: string; error?: { message?: string } } = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("XAI_API_KEY was rejected. Check the key on this deploy.");
  }
  if (res.status === 402) {
    throw new Error(
      "xAI billing needs credits for Grok Imagine video. Add credits on console.x.ai, then retry.",
    );
  }
  if (!res.ok) {
    const detail = json.error?.message || text.slice(0, 180);
    throw new Error(
      `Grok Imagine failed (${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  if (!json.request_id) {
    throw new Error("Grok Imagine did not return a request id.");
  }
  return { requestId: json.request_id };
}

export async function pollGrokVideo(
  requestId: string,
  env: EnvBag = process.env,
  timeoutMs = 240_000,
): Promise<VideoPollBody> {
  const apiKey = xaiApiKey(env);
  if (!apiKey) {
    throw new Error("Video needs XAI_API_KEY. Add it on this deploy, then retry.");
  }
  const started = Date.now();
  let delay = 3_000;
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(
      `https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
    const text = await res.text().catch(() => "");
    let json: VideoPollBody = {};
    try {
      json = text ? (JSON.parse(text) as VideoPollBody) : {};
    } catch {
      /* ignore */
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("XAI_API_KEY was rejected. Check the key on this deploy.");
    }
    if (!res.ok && res.status !== 404) {
      const detail = json.error?.message || text.slice(0, 180);
      throw new Error(
        `Grok Imagine poll failed (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    if (json.status === "done" || json.status === "failed" || json.status === "expired") {
      return json;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(8_000, delay + 500);
  }
  throw new Error("The generator timed out waiting for Grok Imagine.");
}

async function videoFromDelivery(
  url: string,
  apiKey?: string,
): Promise<{ videoBase64: string; mime: string; byteLength: number }> {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Grok Imagine video encoding was invalid.");
    const videoBase64 = match[2] || "";
    return {
      mime: match[1] || "video/mp4",
      videoBase64,
      byteLength: bytesFromBase64(videoBase64),
    };
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });
  if (!res.ok) {
    throw new Error(`Grok Imagine returned no video (${res.status}).`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 2_000) {
    throw new Error("Grok Imagine returned no video.");
  }
  const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
  const mime =
    headerMime && headerMime.startsWith("video/")
      ? headerMime
      : mimeFromVideoUrl(url);
  return {
    videoBase64: buf.toString("base64"),
    mime,
    byteLength: buf.byteLength,
  };
}

export async function generateWithGrokVideo(
  job: VideoJob,
  env: EnvBag = process.env,
): Promise<GrokVideoResult> {
  const { requestId } = await startGrokVideo(job, env);
  const polled = await pollGrokVideo(requestId, env);
  if (polled.status === "failed" || polled.status === "expired") {
    throw new Error(
      polled.error?.message || "Grok Imagine failed to render the video.",
    );
  }
  if (polled.video?.respect_moderation === false) {
    throw new Error("Grok Imagine blocked this clip for safety.");
  }
  const url = polled.video?.url;
  if (!url) {
    throw new Error("Grok Imagine returned no video URL.");
  }
  const file = await videoFromDelivery(url, xaiApiKey(env));
  return {
    ...file,
    durationSec: polled.video?.duration ?? job.durationSec,
    prompt: job.prompt,
    summary: job.summary,
    requestId,
    model: polled.model || grokVideoModel(env),
    respectModeration: true,
  };
}
