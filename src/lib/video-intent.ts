import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  assertAiAllowed,
  chargeAfterVideo,
  refundUsageRecord,
} from "@/lib/billing/gate";
import {
  VIDEO_ASPECTS,
  VideoJobSchema,
  generateWithGrokVideo,
  grokVideoConfigured,
  grokVideoModel,
  type GrokVideoResult,
  type VideoJob,
} from "@/lib/grok-video";
import { extractJsonObject, fallbackVideoJob } from "@/lib/grok-video-prompt";
import {
  humanVideoQaError,
  qaGrokVideoRaw,
  qaVideoJob,
  qaVideoResultFit,
} from "@/lib/grok-video-qa";

/**
 * Human prompt → Grok expands it → Grok Imagine renders → Grok QA.
 * Quota is reserved before render and refunded if QA or generation fails.
 */

const VideoIntentSchema = z.object({
  prompt: z.string().min(2).max(2000),
  durationSec: z.number().min(1).max(15).default(8),
  aspectRatio: z.enum(VIDEO_ASPECTS).default("16:9"),
});
export type VideoIntentInput = z.infer<typeof VideoIntentSchema>;

export const interpretVideoIntent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => VideoIntentSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; job: VideoJob; usedAi: boolean; videoReady: boolean }
      | {
          ok: false;
          error: string;
          job: VideoJob;
          needsUpgrade: boolean;
          usedAi: false;
          videoReady: boolean;
        }
    > => {
      const local = fallbackVideoJob(data);
      const ready = grokVideoConfigured();
      const blocked = await assertAiAllowed(context.userId);
      if (blocked) {
        return {
          ok: false,
          error: blocked,
          job: local,
          needsUpgrade: true,
          usedAi: false,
          videoReady: ready,
        };
      }

      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) {
        return { ok: true, job: local, usedAi: false, videoReady: ready };
      }

      try {
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            model: "grok-4.5",
            temperature: 0.7,
            max_tokens: 700,
            reasoning_effort: "low",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You turn a user's clip idea into a strong text-to-video prompt for Grok Imagine.

Write ORIGINAL scenes only. Never clone a real person's likeness or a copyrighted movie shot-for-shot.
Adult language is allowed when the prompt asks for it.
Never write sexual content involving anyone 17 or under.
Keep the prompt concrete: subject, camera, motion, lighting, setting, mood.
JSON only.`,
              },
              {
                role: "user",
                content: `Duration target: ${data.durationSec}s
Aspect: ${data.aspectRatio}
User prompt: ${data.prompt}

Return JSON:
{
  "prompt": "string — dense video-generator prompt",
  "durationSec": number,
  "aspectRatio": "${data.aspectRatio}",
  "resolution": "720p",
  "summary": "short line for the booth"
}`,
              },
            ],
          }),
        });

        if (!res.ok) {
          return { ok: true, job: local, usedAi: false, videoReady: ready };
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const parsed = VideoJobSchema.parse(
          extractJsonObject(json.choices?.[0]?.message?.content ?? ""),
        );
        return {
          ok: true,
          job: {
            ...parsed,
            durationSec: Math.round(
              Math.min(15, Math.max(1, parsed.durationSec ?? data.durationSec)),
            ),
            aspectRatio: data.aspectRatio,
          },
          usedAi: true,
          videoReady: ready,
        };
      } catch {
        return { ok: true, job: local, usedAi: false, videoReady: ready };
      }
    },
  );

export const runGrokVideoJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        job: VideoJobSchema,
        brief: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | {
          ok: true;
          result: GrokVideoResult;
          qa: { passed: true; reasons: string[] };
          model: string;
        }
      | {
          ok: false;
          error: string;
          qa: { passed: false; reasons: string[] };
        }
    > => {
      if (!grokVideoConfigured()) {
        return {
          ok: false,
          error: "Video needs XAI_API_KEY on this deploy.",
          qa: { passed: false, reasons: ["not_configured"] },
        };
      }

      const pre = qaVideoJob(data.job, data.brief);
      if (!pre.ok) {
        return {
          ok: false,
          error: humanVideoQaError(pre.reasons),
          qa: { passed: false, reasons: pre.reasons },
        };
      }

      let reserved: Awaited<ReturnType<typeof chargeAfterVideo>> = null;
      try {
        reserved = await chargeAfterVideo(context.userId);
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "Could not reserve quota for this video.",
          qa: { passed: false, reasons: ["billing"] },
        };
      }

      try {
        const result = await generateWithGrokVideo(data.job);
        const raw = qaGrokVideoRaw(result);
        if (!raw.ok) {
          await refundUsageRecord(context.userId, reserved);
          return {
            ok: false,
            error: humanVideoQaError(raw.reasons),
            qa: { passed: false, reasons: raw.reasons },
          };
        }

        const fit = await qaVideoResultFit({
          brief: data.brief || data.job.summary,
          job: data.job,
          result,
        });
        if (!fit.ok) {
          await refundUsageRecord(context.userId, reserved);
          return {
            ok: false,
            error: humanVideoQaError(fit.reasons),
            qa: { passed: false, reasons: fit.reasons },
          };
        }

        return {
          ok: true,
          result,
          qa: { passed: true, reasons: [...pre.reasons, ...raw.reasons] },
          model: grokVideoModel(),
        };
      } catch (err) {
        await refundUsageRecord(context.userId, reserved);
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "Grok Imagine could not render the video.",
          qa: { passed: false, reasons: ["generate_error"] },
        };
      }
    },
  );
