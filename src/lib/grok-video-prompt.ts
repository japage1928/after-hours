import type { VideoAspect, VideoJob } from "./grok-video.ts";
import { clampVideoDuration } from "./grok-video.ts";

export type VideoIntentInput = {
  prompt: string;
  durationSec: number;
  aspectRatio: VideoAspect;
};

/** Local stand-in when grok-4.5 chat is down — still a real video prompt. */
export function fallbackVideoJob(input: VideoIntentInput): VideoJob {
  const brief = input.prompt.trim().replace(/\s+/g, " ");
  const durationSec = clampVideoDuration(input.durationSec);
  const camera =
    input.aspectRatio === "9:16"
      ? "vertical handheld frame, slow push-in"
      : input.aspectRatio === "1:1"
        ? "square centered frame, gentle orbit"
        : "widescreen cinematic frame, slow dolly";
  const prompt =
    `${brief}. ${camera}, practical lighting, natural motion, continuous shot, ` +
    `no on-screen text, no logos, original scene only.`.slice(0, 2000);
  const summary =
    brief.length > 72 ? `${brief.slice(0, 69).trimEnd()}…` : brief || "After Hours clip";
  return {
    prompt,
    durationSec,
    aspectRatio: input.aspectRatio,
    resolution: "720p",
    summary,
  };
}

export function extractJsonObject(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No video intent JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}
