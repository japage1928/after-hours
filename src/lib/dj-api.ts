import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const MixPlanSchema = z.object({
  targetBpm: z.number().min(70).max(180),
  aOffsetSec: z.number().min(0).max(600),
  bOffsetSec: z.number().min(0).max(600),
  mixInSec: z.number().min(0).max(180),
  crossfadeSec: z.number().min(1).max(40),
  holdSec: z.number().min(0).max(90),
  sweepA: z.boolean(),
  cue: z.string().max(220),
});
export type MixPlan = z.infer<typeof MixPlanSchema>;

export const PlanMixInputSchema = z.object({
  nameA: z.string().min(1).max(80),
  nameB: z.string().min(1).max(80),
  bpmA: z.number().min(60).max(200),
  bpmB: z.number().min(60).max(200),
  durationA: z.number().min(1).max(900),
  durationB: z.number().min(1).max(900),
  prompt: z.string().max(400),
});
export type PlanMixInput = z.infer<typeof PlanMixInputSchema>;

export function fallbackPlan(input: PlanMixInput): MixPlan {
  const targetBpm = Math.round((input.bpmA + input.bpmB) / 2);
  const barA = (60 / input.bpmA) * 4;
  const barB = (60 / input.bpmB) * 4;
  const mixInSec = Math.min(input.durationA * 0.45, barA * 8);
  const crossfadeSec = Math.min(barA * 4, 16);
  return {
    targetBpm,
    aOffsetSec: 0,
    bOffsetSec: input.durationB > barB * 8 ? barB * 4 : 0,
    mixInSec: Math.max(4, mixInSec),
    crossfadeSec: Math.max(4, crossfadeSec),
    holdSec: Math.min(16, input.durationB * 0.4),
    sweepA: true,
    cue: `Beat-match to ${targetBpm}, ride A, then bring B in over four bars.`,
  };
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No mix plan.");
  return JSON.parse(raw.slice(start, end + 1));
}

export const planMix = createServerFn({ method: "POST" })
  .validator((input: unknown) => PlanMixInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; plan: MixPlan } | { ok: false; error: string; plan: MixPlan }> => {
    const local = fallbackPlan(data);
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: true, plan: local };

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(18000),
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.4,
          max_tokens: 400,
          reasoning_effort: "low",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a club DJ programming a two-deck mix. Plan beat-matching and a crossfade. Never request copyrighted audio, never clone artist voices, never name a plan as impersonating a real singer. JSON only.",
            },
            {
              role: "user",
              content: `Deck A: "${data.nameA}" ${data.bpmA} BPM, ${data.durationA.toFixed(1)}s
Deck B: "${data.nameB}" ${data.bpmB} BPM, ${data.durationB.toFixed(1)}s
DJ note: ${data.prompt || "Smooth club blend, keep the kick, bring B in at a natural drop."}

JSON:
{
  "targetBpm": number,
  "aOffsetSec": seconds into A to start,
  "bOffsetSec": seconds into B to enter (drop/chorus if long enough),
  "mixInSec": seconds after A starts before B enters,
  "crossfadeSec": 4-16,
  "holdSec": seconds to ride B after the fade,
  "sweepA": true,
  "cue": "one short sentence the DJ would say"
}
Offsets must fit inside each track. mixInSec + crossfadeSec must fit inside remaining A.`,
            },
          ],
        }),
      });
      if (!res.ok) return { ok: true, plan: local };
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const parsed = MixPlanSchema.parse(extractJson(json.choices?.[0]?.message?.content ?? ""));
      const aMax = Math.max(0, data.durationA - 2);
      const bMax = Math.max(0, data.durationB - 2);
      const plan: MixPlan = {
        ...parsed,
        aOffsetSec: Math.min(parsed.aOffsetSec, aMax),
        bOffsetSec: Math.min(parsed.bOffsetSec, bMax),
        mixInSec: Math.min(parsed.mixInSec, Math.max(2, data.durationA - parsed.aOffsetSec - 2)),
        crossfadeSec: Math.min(parsed.crossfadeSec, 24),
      };
      return { ok: true, plan };
    } catch {
      return { ok: true, plan: local };
    }
  });
