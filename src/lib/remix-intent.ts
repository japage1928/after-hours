import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertAiAllowed, chargeAfterMix } from "@/lib/billing/gate";
import {
  AceStepJobSchema,
  aceStepConfigured,
  generateWithAceStep,
  type AceStepJob,
  type AceStepResult,
} from "@/lib/ace-step";
import {
  mergeVerdicts,
  qaAceStepJob,
  qaAceStepRaw,
  qaBriefFit,
} from "@/lib/ace-step-qa";
import { GROOVE_STYLES, type GrooveStyle } from "@/lib/ai-beat";

/**
 * Plain English remix brief → ACE-Step production prompt.
 * This is the LLM’s job for remix: intent translation, not deck mixing.
 */

const IntentInputSchema = z.object({
  brief: z.string().min(1).max(400),
  genre: z.string().refine((v): v is GrooveStyle =>
    GROOVE_STYLES.some((g) => g.id === v),
  ),
  songName: z.string().min(1).max(80),
  songBpm: z.number().min(60).max(200),
  songDurationSec: z.number().min(1).max(900),
  instrumental: z.boolean().default(true),
});
export type RemixIntentInput = z.infer<typeof IntentInputSchema>;

function genreMeta(id: GrooveStyle) {
  return GROOVE_STYLES.find((g) => g.id === id) ?? GROOVE_STYLES[0]!;
}

/** Local fallback when the LLM is unavailable — still ACE-Step-shaped. */
export function fallbackAceStepJob(input: RemixIntentInput): AceStepJob {
  const g = genreMeta(input.genre as GrooveStyle);
  const bpm = Math.round(input.songBpm * 0.55 + g.suggestedBpm * 0.45);
  const caption = [
    `${g.label} remix instrumental`,
    input.brief.trim() || `rework of "${input.songName}"`,
    g.blurb,
    "modern production, punchy drums, clear low end, original composition only",
  ].join(", ");

  return AceStepJobSchema.parse({
    caption,
    lyrics: "[Instrumental]",
    bpm: Math.max(70, Math.min(180, bpm)),
    durationSec: Math.min(
      90,
      Math.max(32, Math.round(Math.min(input.songDurationSec * 0.45, 72))),
    ),
    vocalLanguage: "en",
    instrumental: true,
    summary: `${g.label} remix bed for ${input.songName}`,
  });
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No remix intent JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

export const interpretRemixIntent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => IntentInputSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; job: AceStepJob; usedAi: boolean; aceStepReady: boolean }
      | {
          ok: false;
          error: string;
          job: AceStepJob;
          needsUpgrade: boolean;
          usedAi: false;
          aceStepReady: boolean;
        }
    > => {
      const local = fallbackAceStepJob(data);
      const ready = aceStepConfigured();
      const blocked = await assertAiAllowed(context.userId);
      if (blocked) {
        return {
          ok: false,
          error: blocked,
          job: local,
          needsUpgrade: true,
          usedAi: false,
          aceStepReady: ready,
        };
      }

      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) {
        return { ok: true, job: local, usedAi: false, aceStepReady: ready };
      }

      const g = genreMeta(data.genre as GrooveStyle);

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
            temperature: 0.4,
            max_tokens: 900,
            reasoning_effort: "low",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You turn plain-English remix requests into ACE-Step music-generation prompts.

ACE-Step needs:
- caption: dense style paragraph (genre, drums, bass, instruments, mood, production, energy). No artist clones.
- lyrics: full lyric script with [Verse]/[Chorus]/[Bridge] tags, OR [Instrumental] for a beat bed.
- bpm, durationSec, vocalLanguage, instrumental, summary.

You are NOT riding DJ decks. You write the production brief ACE-Step will perform.

Rules:
- Honor the genre lane: ${g.label} (${g.blurb}).
- Original music only — never request a copyrighted melody or named artist's recording.
- For a beat bed under the user's song: instrumental=true, lyrics="[Instrumental]".
- For sung remix vocals: write original lyrics that fit the brief.
- Caption under ~80 words, concrete and musical.
JSON only.`,
              },
              {
                role: "user",
                content: `Genre lane: ${g.label}
Song on deck: "${data.songName}" (~${Math.round(data.songBpm)} BPM, ${data.songDurationSec.toFixed(0)}s)
User said (plain English): ${data.brief}
Prefer instrumental beat bed: ${data.instrumental !== false}

Return JSON:
{
  "caption": "string — ACE-Step style caption",
  "lyrics": "string — [Instrumental] or full tagged lyrics",
  "bpm": number,
  "durationSec": number,
  "vocalLanguage": "en",
  "instrumental": boolean,
  "summary": "short line for the booth UI"
}`,
              },
            ],
          }),
        });

        if (!res.ok) {
          return { ok: true, job: local, usedAi: false, aceStepReady: ready };
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const parsed = AceStepJobSchema.parse(
          extractJson(json.choices?.[0]?.message?.content ?? ""),
        );

        try {
          await chargeAfterMix(context.userId);
        } catch {
          return { ok: true, job: local, usedAi: false, aceStepReady: ready };
        }

        return {
          ok: true,
          job: parsed,
          usedAi: true,
          aceStepReady: ready,
        };
      } catch {
        return { ok: true, job: local, usedAi: false, aceStepReady: ready };
      }
    },
  );

/** Execute ACE-Step with automated QA; regenerate once on hard failure. */
export const runAceStepJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        job: AceStepJobSchema,
        brief: z.string().max(400).optional(),
        genreLabel: z.string().max(40).optional(),
        /** Client asks for a second attempt after buffer QA failed. */
        forceRetry: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<
      | {
          ok: true;
          result: AceStepResult;
          qa: { passed: true; reasons: string[]; regenerated: boolean };
        }
      | {
          ok: false;
          error: string;
          qa: { passed: false; reasons: string[]; regenerated: boolean };
        }
    > => {
      if (!aceStepConfigured()) {
        return {
          ok: false,
          error: "ACE-Step is not configured on this deploy.",
          qa: { passed: false, reasons: ["not_configured"], regenerated: false },
        };
      }

      const pre = qaAceStepJob(data.job, data.brief);
      if (!pre.ok) {
        return {
          ok: false,
          error: pre.reasons[0] || "Remix brief failed QA.",
          qa: { passed: false, reasons: pre.reasons, regenerated: false },
        };
      }

      // Soft brief-fit — nudge caption if mismatch, don't hard-fail.
      if (data.brief && data.genreLabel) {
        const fit = await qaBriefFit({
          brief: data.brief,
          genreLabel: data.genreLabel,
          job: data.job,
        });
        if (!fit.ok && fit.reasons[0]) {
          data.job = {
            ...data.job,
            caption: `${data.genreLabel} remix, ${data.brief}. ${data.job.caption}`.slice(
              0,
              1200,
            ),
          };
        }
      }

      const attempt = async (
        job: AceStepJob,
        regenerated: boolean,
      ): Promise<
        | {
            ok: true;
            result: AceStepResult;
            qa: { passed: true; reasons: string[]; regenerated: boolean };
          }
        | {
            ok: false;
            error: string;
            qa: { passed: false; reasons: string[]; regenerated: boolean };
          }
      > => {
        try {
          const result = await generateWithAceStep(job);
          const raw = qaAceStepRaw(result);
          if (!raw.ok) {
            return {
              ok: false,
              error: raw.reasons[0] || "ACE-Step audio failed QA.",
              qa: {
                passed: false,
                reasons: raw.reasons,
                regenerated,
              },
            };
          }
          return {
            ok: true,
            result,
            qa: {
              passed: true,
              reasons: mergeVerdicts(pre, raw).reasons,
              regenerated,
            },
          };
        } catch (err) {
          return {
            ok: false,
            error:
              err instanceof Error ? err.message : "ACE-Step generation failed.",
            qa: { passed: false, reasons: ["generate_error"], regenerated },
          };
        }
      };

      const first = await attempt(data.job, false);
      if (first.ok) return first;

      // One regenerate with a tightened caption.
      const second = await attempt(
        {
          ...data.job,
          caption:
            `${data.job.caption}. Clean mix, strong kick, no silence, full duration.`.slice(
              0,
              1200,
            ),
        },
        true,
      );
      if (second.ok) return second;

      return {
        ok: false,
        error: second.error || first.error,
        qa: {
          passed: false,
          reasons: [
            ...first.qa.reasons,
            ...second.qa.reasons,
            data.forceRetry ? "client_retry_exhausted" : "server_retry_exhausted",
          ],
          regenerated: true,
        },
      };
    },
  );
