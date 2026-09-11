import { z } from "zod";
import type { AceStepJob, AceStepResult } from "@/lib/ace-step";

/**
 * Thin automated QA before ACE-Step audio reaches the booth.
 * Hard fails → regenerate once or fall back to local genre bed.
 */

export type QaVerdict = {
  ok: boolean;
  reasons: string[];
};

const MINOR_SEX =
  /\b(child|children|kid|kids|minor|minors|underage|teen|teens|teenage|preteen|loli|pedo)\b/i;

const BLOCKED_CLONE =
  /\b(cover of|karaoke of|exact replica of|stem from|ripped from)\b/i;

export function qaAceStepJob(job: AceStepJob, brief?: string): QaVerdict {
  const reasons: string[] = [];
  const blob = `${job.caption}\n${job.lyrics}\n${job.summary}`;

  if (job.caption.trim().length < 12) {
    reasons.push("Caption too thin for ACE-Step.");
  }
  if (MINOR_SEX.test(blob) && /\b(sex|sexual|nude|naked|porn)\b/i.test(blob)) {
    reasons.push("Blocked sexual content involving minors.");
  }
  if (BLOCKED_CLONE.test(blob)) {
    reasons.push("Prompt asks to clone or rip a copyrighted recording.");
  }
  if (job.bpm != null && (job.bpm < 60 || job.bpm > 200)) {
    reasons.push("BPM out of range.");
  }
  if (job.durationSec != null && (job.durationSec < 12 || job.durationSec > 240)) {
    reasons.push("Duration out of range.");
  }
  if (brief && brief.length > 8) {
    // Soft signal only — not a hard fail by itself.
    const genreHint = brief.toLowerCase();
    const caption = job.caption.toLowerCase();
    const tokens = genreHint
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 4)
      .slice(0, 8);
    const hits = tokens.filter((t) => caption.includes(t)).length;
    if (tokens.length >= 3 && hits === 0) {
      reasons.push("Caption may not reflect the user brief (soft).");
    }
  }

  const hard = reasons.filter((r) => !r.includes("(soft)"));
  return { ok: hard.length === 0, reasons };
}

/** Raw transport checks before decode. */
export function qaAceStepRaw(result: AceStepResult): QaVerdict {
  const reasons: string[] = [];
  const bytes = Math.floor((result.audioBase64?.length ?? 0) * 0.75);
  if (!result.audioBase64 || result.audioBase64.length < 800) {
    reasons.push("Audio payload missing or tiny.");
  }
  if (bytes < 8_000) {
    reasons.push("Audio file suspiciously small.");
  }
  if (bytes > 25_000_000) {
    reasons.push("Audio file too large.");
  }
  if (result.mime && !/^audio\//i.test(result.mime) && result.mime !== "application/octet-stream") {
    reasons.push(`Unexpected mime type: ${result.mime}`);
  }
  return { ok: reasons.length === 0, reasons };
}

export type BufferQaOpts = {
  minDurationSec?: number;
  maxDurationSec?: number;
  /** Peak absolute sample must exceed this (silence floor). */
  minPeak?: number;
  /** RMS must exceed this. */
  minRms?: number;
  /** Peak above this counts as clipped. */
  clipPeak?: number;
};

/** Client-side metrics after decode — the authoritative audio QA. */
export function qaAudioBuffer(
  buffer: AudioBuffer,
  opts: BufferQaOpts = {},
): QaVerdict {
  const reasons: string[] = [];
  const minDur = opts.minDurationSec ?? 8;
  const maxDur = opts.maxDurationSec ?? 240;
  const minPeak = opts.minPeak ?? 0.02;
  const minRms = opts.minRms ?? 0.004;
  const clipPeak = opts.clipPeak ?? 0.99;

  if (!buffer.numberOfChannels || buffer.length < 256) {
    reasons.push("Decoded buffer empty.");
    return { ok: false, reasons };
  }
  if (buffer.duration < minDur) {
    reasons.push(`Too short (${buffer.duration.toFixed(1)}s).`);
  }
  if (buffer.duration > maxDur) {
    reasons.push(`Too long (${buffer.duration.toFixed(1)}s).`);
  }

  const ch = buffer.getChannelData(0);
  let peak = 0;
  let sumSq = 0;
  let clipped = 0;
  // Stride for speed on long buffers.
  const step = Math.max(1, Math.floor(ch.length / 80_000));
  let n = 0;
  for (let i = 0; i < ch.length; i += step) {
    const v = Math.abs(ch[i]!);
    if (v > peak) peak = v;
    sumSq += v * v;
    if (v >= clipPeak) clipped += 1;
    n += 1;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n));
  if (peak < minPeak) reasons.push("Near-silent (peak too low).");
  if (rms < minRms) reasons.push("Near-silent (RMS too low).");
  if (clipped / Math.max(1, n) > 0.02) reasons.push("Heavily clipped.");

  return { ok: reasons.length === 0, reasons };
}

const BriefFitSchema = z.object({
  ok: z.boolean(),
  reason: z.string().max(200).optional(),
});

/**
 * Soft LLM check: does the ACE-Step caption match the user brief + genre?
 * Failures are soft — caller may still accept audio if buffer QA passed.
 */
export async function qaBriefFit(opts: {
  brief: string;
  genreLabel: string;
  job: AceStepJob;
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
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0,
        max_tokens: 120,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You QA an ACE-Step remix brief. Return JSON {"ok":boolean,"reason":"short"}.
ok=false only if the caption clearly ignores the genre lane or user brief, or asks to clone a real artist recording.
Be lenient on wording.`,
          },
          {
            role: "user",
            content: `Genre: ${opts.genreLabel}
User brief: ${opts.brief}
ACE caption: ${opts.job.caption}
ACE summary: ${opts.job.summary}
Instrumental: ${opts.job.instrumental}`,
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
      reasons: [parsed.reason || "Brief/genre mismatch (soft)."],
    };
  } catch {
    return { ok: true, reasons: [] };
  }
}

export function mergeVerdicts(...parts: QaVerdict[]): QaVerdict {
  const reasons = parts.flatMap((p) => p.reasons);
  return { ok: parts.every((p) => p.ok), reasons };
}
