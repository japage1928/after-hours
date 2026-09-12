import { z } from "zod";
import {
  bytesFromBase64,
  type GrokVideoResult,
  type VideoJob,
} from "./grok-video.ts";

export type QaVerdict = {
  ok: boolean;
  reasons: string[];
};

const MINOR_SEX =
  /\b(child|children|kid|kids|minor|minors|underage|teen|teens|teenage|preteen|loli|pedo)\b/i;

const BLOCKED_CLONE =
  /\b(deepfake|exact replica of|impersonate|real person named)\b/i;

const BriefFitSchema = z.object({
  ok: z.boolean(),
  reason: z.string().max(200).optional(),
});

export function qaVideoJob(job: VideoJob, brief?: string): QaVerdict {
  const reasons: string[] = [];
  const blob = `${job.prompt}\n${job.summary}\n${brief ?? ""}`;

  if (job.prompt.trim().length < 12) {
    reasons.push("Video prompt is too thin.");
  }
  if (MINOR_SEX.test(blob) && /\b(sex|sexual|nude|naked|porn)\b/i.test(blob)) {
    reasons.push("Blocked sexual content involving minors.");
  }
  if (BLOCKED_CLONE.test(blob)) {
    reasons.push("Prompt asks to deepfake or impersonate a real person.");
  }
  if (job.durationSec < 1 || job.durationSec > 15) {
    reasons.push("Duration out of range.");
  }
  if (brief && brief.length > 8) {
    const tokens = brief
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 4)
      .slice(0, 8);
    const prompt = job.prompt.toLowerCase();
    const hits = tokens.filter((t) => prompt.includes(t)).length;
    if (tokens.length >= 3 && hits === 0) {
      reasons.push("Expanded prompt may not reflect the user brief (soft).");
    }
  }

  const hard = reasons.filter((r) => !r.includes("(soft)"));
  return { ok: hard.length === 0, reasons };
}

export function qaGrokVideoRaw(result: GrokVideoResult): QaVerdict {
  const reasons: string[] = [];
  const bytes = result.byteLength || bytesFromBase64(result.videoBase64);
  if (!result.videoBase64 || result.videoBase64.length < 800) {
    reasons.push("Video payload missing or tiny.");
  }
  if (bytes < 8_000) {
    reasons.push("Video file suspiciously small.");
  }
  if (bytes > 40_000_000) {
    reasons.push("Video file too large.");
  }
  if (
    result.mime &&
    !/^video\//i.test(result.mime) &&
    result.mime !== "application/octet-stream"
  ) {
    reasons.push(`Unexpected mime type: ${result.mime}`);
  }
  if (result.respectModeration === false) {
    reasons.push("Grok Imagine flagged the clip as unsafe.");
  }
  if (result.durationSec < 1 || result.durationSec > 16) {
    reasons.push("Rendered duration out of range.");
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Grok QA of prompt + output metadata (not a fake video).
 * Hard-fail only for unsafe, empty, or clearly off-brief jobs.
 */
export async function qaVideoResultFit(opts: {
  brief: string;
  job: VideoJob;
  result: Pick<
    GrokVideoResult,
    "durationSec" | "mime" | "byteLength" | "respectModeration" | "summary"
  >;
  apiKey?: string;
}): Promise<QaVerdict> {
  const apiKey = opts.apiKey ?? process.env.XAI_API_KEY;
  if (!apiKey) return { ok: true, reasons: [] };

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0,
        max_tokens: 160,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You QA a text-to-video job. Return JSON {"ok":boolean,"reason":"short"}.
ok=false only if the result is unsafe, empty/tiny, or clearly ignores the user brief.
Be lenient on wording. Do not reject for style taste.`,
          },
          {
            role: "user",
            content: `User brief: ${opts.brief}
Expanded prompt: ${opts.job.prompt}
Summary: ${opts.result.summary}
Duration: ${opts.result.durationSec}s (asked ${opts.job.durationSec}s)
Mime: ${opts.result.mime}
Bytes: ${opts.result.byteLength}
Respects moderation: ${opts.result.respectModeration}`,
          },
        ],
      }),
    });
    if (!res.ok) return { ok: true, reasons: [] };
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = BriefFitSchema.parse(
      JSON.parse(start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw),
    );
    if (parsed.ok) return { ok: true, reasons: [] };
    return {
      ok: false,
      reasons: [parsed.reason || "Video failed Grok QA."],
    };
  } catch {
    return { ok: true, reasons: [] };
  }
}

export function mergeVerdicts(...parts: QaVerdict[]): QaVerdict {
  const reasons = parts.flatMap((p) => p.reasons);
  return { ok: parts.every((p) => p.ok), reasons };
}

export function humanVideoQaError(reasons: string[]): string {
  const first = reasons[0] || "Grok rejected this video.";
  if (/minor/i.test(first)) return first;
  if (/unsafe|moderation|safety/i.test(first)) {
    return "Grok rejected this clip for safety. Try a different brief.";
  }
  if (/tiny|missing|empty/i.test(first)) {
    return "The video came back empty. Nothing was saved — try again.";
  }
  if (/off-brief|ignore|mismatch|not reflect/i.test(first)) {
    return `Grok said this clip missed your brief (${first}). Nothing was saved.`;
  }
  return first;
}
