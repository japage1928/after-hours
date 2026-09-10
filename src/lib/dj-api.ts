import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const MixJobSchema = z.enum(["mashup", "remix", "both"]);
export type MixJob = z.infer<typeof MixJobSchema>;

export const MixPlanSchema = z.object({
  job: MixJobSchema.default("mashup"),
  targetBpm: z.number().min(70).max(180),
  aOffsetSec: z.number().min(0).max(600).default(0),
  bOffsetSec: z.number().min(0).max(600).default(0),
  mixInSec: z.number().min(0).max(180).default(8),
  crossfadeSec: z.number().min(1).max(40).default(8),
  holdSec: z.number().min(0).max(90).default(12),
  dropSec: z.number().min(0).max(90).default(8),
  bassBoost: z.number().min(-1).max(1).default(0.45),
  midCut: z.number().min(-1).max(1).default(-0.2),
  air: z.number().min(-1).max(1).default(0.25),
  pump: z.boolean().default(true),
  sweepA: z.boolean().default(true),
  cue: z.string().max(220),
});
export type MixPlan = z.infer<typeof MixPlanSchema>;

export const PlanMixInputSchema = z.object({
  job: MixJobSchema.default("mashup"),
  nameA: z.string().min(1).max(80),
  nameB: z.string().max(80).default(""),
  bpmA: z.number().min(60).max(200),
  bpmB: z.number().min(60).max(200).default(120),
  durationA: z.number().min(1).max(900),
  durationB: z.number().min(0).max(900).default(0),
  prompt: z.string().max(400),
});
export type PlanMixInput = z.infer<typeof PlanMixInputSchema>;

export function fallbackPlan(input: PlanMixInput): MixPlan {
  const job = input.job;
  if (job === "remix") {
    const targetBpm =
      input.bpmA < 118 ? 126 : input.bpmA < 130 ? 140 : 124;
    const bar = (60 / input.bpmA) * 4;
    return {
      job,
      targetBpm,
      aOffsetSec: 0,
      bOffsetSec: 0,
      mixInSec: 0,
      crossfadeSec: 4,
      holdSec: 24,
      dropSec: bar * 4,
      bassBoost: 0.6,
      midCut: -0.3,
      air: 0.35,
      pump: true,
      sweepA: true,
      cue: `Club remix of ${input.nameA} at ${targetBpm} BPM — new kick, chopped vocal, drop at bar 5.`,
    };
  }
  const targetBpm = Math.round((input.bpmA + (input.bpmB || input.bpmA)) / 2);
  const barA = (60 / input.bpmA) * 4;
  const barB = (60 / (input.bpmB || input.bpmA)) * 4;
  const mixInSec = Math.min(input.durationA * 0.45, barA * 8);
  const crossfadeSec = Math.min(barA * 4, 16);
  const remix = job === "both";
  return {
    job,
    targetBpm,
    aOffsetSec: 0,
    bOffsetSec: input.durationB > barB * 8 ? barB * 4 : 0,
    mixInSec: Math.max(4, mixInSec),
    crossfadeSec: Math.max(4, crossfadeSec),
    holdSec: Math.min(16, Math.max(8, input.durationB * 0.4)),
    dropSec: Math.max(4, mixInSec),
    bassBoost: remix ? 0.5 : 0,
    midCut: remix ? -0.2 : 0,
    air: remix ? 0.25 : 0,
    pump: remix,
    sweepA: true,
    cue: remix
      ? `Remix mash ${input.nameA} × ${input.nameB} at ${targetBpm} — new drums, A chopped, B in at the drop.`
      : `Beat-match to ${targetBpm}, ride A, then bring B in over four bars.`,
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

function systemFor(job: MixJob): string {
  if (job === "remix") {
    return "You are a remix engineer. One track. Plan a club remix with a NEW drum bed, chopped vocal, and a drop — not a playback of the original. New tempo must jump at least 8 BPM. Never clone artist voices. JSON only.";
  }
  if (job === "both") {
    return "You are a DJ remixing a two-song mashup. Beat-match AND restyle: new tempo, EQ, a drop where B enters. Never clone artist voices. JSON only.";
  }
  return "You are a club DJ programming a two-deck mix. Plan beat-matching and a crossfade. Never request copyrighted audio, never clone artist voices. JSON only.";
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
            { role: "system", content: systemFor(data.job) },
            {
              role: "user",
              content: `Job: ${data.job}
Track A: "${data.nameA}" ${data.bpmA} BPM, ${data.durationA.toFixed(1)}s
${data.job === "remix" ? "" : `Track B: "${data.nameB}" ${data.bpmB} BPM, ${data.durationB.toFixed(1)}s`}
Note: ${data.prompt || (data.job === "remix" ? "Club remix, heavier kick, open the drop." : "Smooth blend, keep the kick.")}

JSON:
{
  "job": "${data.job}",
  "targetBpm": number,
  "aOffsetSec": seconds into A to start,
  "bOffsetSec": seconds into B to enter (0 if remix),
  "mixInSec": seconds after A starts before B enters (0 if remix),
  "crossfadeSec": 4-16,
  "holdSec": seconds to ride after the drop,
  "dropSec": seconds until the filter opens,
  "bassBoost": -1 to 1,
  "midCut": -1 to 1,
  "air": -1 to 1,
  "pump": true,
  "sweepA": true,
  "cue": "one short sentence"
}
Offsets must fit inside each track.`,
            },
          ],
        }),
      });
      if (!res.ok) return { ok: true, plan: local };
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const parsed = MixPlanSchema.parse(extractJson(json.choices?.[0]?.message?.content ?? ""));
      const aMax = Math.max(0, data.durationA - 2);
      const bMax = Math.max(0, (data.durationB || 0) - 2);
      const plan: MixPlan = {
        ...parsed,
        job: data.job,
        aOffsetSec: Math.min(parsed.aOffsetSec, aMax),
        bOffsetSec: Math.min(parsed.bOffsetSec, bMax),
        mixInSec: data.job === "remix" ? 0 : Math.min(parsed.mixInSec, Math.max(2, data.durationA - parsed.aOffsetSec - 2)),
        crossfadeSec: Math.min(parsed.crossfadeSec, 24),
        dropSec: Math.min(parsed.dropSec, Math.max(4, data.durationA * 0.6)),
      };
      return { ok: true, plan };
    } catch {
      return { ok: true, plan: local };
    }
  });
