import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertAiAllowed } from "@/lib/billing/gate";
import {
  AceStepJobSchema,
  aceStepConfigured,
  type AceStepJob,
} from "@/lib/ace-step";
import { GROOVE_STYLES, type GrooveStyle } from "@/lib/ai-beat";
import { fallbackGenerateJob } from "@/lib/generate-job";

/**
 * Suno-like generate: prompt + style + optional lyrics → ACE-Step job.
 * The LLM translates intent; ACE-Step performs the song.
 */

const GenerateIntentSchema = z.object({
  prompt: z.string().min(2).max(2000),
  style: z.string().refine((v): v is GrooveStyle =>
    GROOVE_STYLES.some((g) => g.id === v),
  ),
  lyrics: z.string().max(4000).optional().default(""),
  durationSec: z.number().min(20).max(120).default(60),
  instrumental: z.boolean().default(false),
});
export type GenerateIntentInput = z.infer<typeof GenerateIntentSchema>;

function genreMeta(id: GrooveStyle) {
  return GROOVE_STYLES.find((g) => g.id === id) ?? GROOVE_STYLES[0]!;
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No generate intent JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

export const interpretGenerateIntent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => GenerateIntentSchema.parse(input))
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
      const local = fallbackGenerateJob(data);
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

      const g = genreMeta(data.style as GrooveStyle);
      const wantInstrumental = Boolean(data.instrumental) && !data.lyrics?.trim();

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
            max_tokens: 1400,
            reasoning_effort: "low",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You turn a user's song request into an ACE-Step music-generation job.

ACE-Step needs:
- caption: dense style paragraph (genre, drums, bass, instruments, mood, vocal character, production). Original music only — never clone a named artist recording.
- lyrics: full lyric script with [Verse]/[Chorus]/[Bridge] tags, OR [Instrumental].
- bpm, durationSec, vocalLanguage, instrumental, summary.

Write ORIGINAL lyrics. If the user pasted lyrics, honor them (clean tags). Adult language is allowed when the prompt asks for it.
Never write sexual content involving anyone 17 or under.
JSON only.`,
              },
              {
                role: "user",
                content: `Style lane: ${g.label} (${g.blurb})
Duration target: ${data.durationSec}s
Instrumental: ${wantInstrumental}
User prompt: ${data.prompt}
User lyrics (optional): ${data.lyrics?.trim() || "(none — write original lyrics unless instrumental)"}

Return JSON:
{
  "caption": "string",
  "lyrics": "string",
  "bpm": number,
  "durationSec": number,
  "vocalLanguage": "en",
  "instrumental": boolean,
  "summary": "short line for the booth"
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
        return {
          ok: true,
          job: {
            ...parsed,
            durationSec: Math.round(
              Math.min(120, Math.max(20, parsed.durationSec ?? data.durationSec)),
            ),
          },
          usedAi: true,
          aceStepReady: ready,
        };
      } catch {
        return { ok: true, job: local, usedAi: false, aceStepReady: ready };
      }
    },
  );
