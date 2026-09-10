import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { snapClubBpm } from "@/lib/bpm";

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
  energyA: z.string().max(400).default(""),
  energyB: z.string().max(400).default(""),
  peakASec: z.number().min(0).max(600).default(0),
  peakBSec: z.number().min(0).max(600).default(0),
  dropBarA: z.number().int().min(0).max(200).default(16),
  dropBarB: z.number().int().min(0).max(200).default(16),
});
export type PlanMixInput = z.infer<typeof PlanMixInputSchema>;

export function fallbackPlan(input: PlanMixInput): MixPlan {
  const job = input.job;
  if (job === "remix") {
    const targetBpm = snapClubBpm(input.bpmA, "remix");
    const bar = (60 / input.bpmA) * 4;
    return {
      job,
      targetBpm,
      aOffsetSec: input.peakASec || 0,
      bOffsetSec: 0,
      mixInSec: 0,
      crossfadeSec: 8,
      holdSec: 32,
      dropSec: bar * 8,
      bassBoost: 0.6,
      midCut: -0.3,
      air: 0.35,
      pump: true,
      sweepA: true,
      cue: `DJ remix of ${input.nameA} at ${targetBpm} — 32-bar club edit, new drums, vocal on top, drop at bar 9.`,
    };
  }
  const targetBpm = snapClubBpm((input.bpmA + (input.bpmB || input.bpmA)) / 2, job);
  const barA = (60 / input.bpmA) * 4;
  const barB = (60 / (input.bpmB || input.bpmA)) * 4;
  const remix = job === "both";
  return {
    job,
    targetBpm,
    aOffsetSec: input.peakASec || 0,
    bOffsetSec: input.peakBSec || (input.durationB > barB * 8 ? barB * 8 : 0),
    mixInSec: barA * 8,
    crossfadeSec: barA * 8,
    holdSec: barA * 16,
    dropSec: barA * 8,
    bassBoost: remix ? 0.5 : 0,
    midCut: remix ? -0.2 : 0,
    air: remix ? 0.25 : 0,
    pump: remix,
    sweepA: true,
    cue: remix
      ? `Bootleg of ${input.nameA} × ${input.nameB} at ${targetBpm} — new drums, A then B over the drop.`
      : `DJ mashup ${input.nameA} × ${input.nameB} at ${targetBpm} — phrase-locked, bass swap at bar 17.`,
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
  const rules = `You are a working club DJ. Produce a 32-bar edit a real DJ would play.
Rules:
- Only mix or drop on an 8-bar phrase (bar 9 or 17). Never in the middle of a phrase.
- aOffsetSec/bOffsetSec must be the start of a high-energy phrase (the drop/chorus), on a bar line.
- Mashup: ride A 16 bars, bass-swap on the 1 of bar 17, ride B. Do not loop the same 8 bars.
- Remix: drums intro 8 bars, tease the vocal, drop the record at bar 9 and RIDE it. Original stays high-passed.
- Cue: one sentence a DJ would say in the booth.
Never clone artist voices. JSON only.`;
  if (job === "remix") return rules;
  if (job === "both") return `${rules}\nBootleg: new drums, A through the first drop, B from bar 17.`;
  return rules;
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
A energy by bar (low→high): ${data.energyA || "n/a"}
A drop around bar ${data.dropBarA}, loudest phrase at ${data.peakASec.toFixed(1)}s
${data.job === "remix" ? "" : `Track B: "${data.nameB}" ${data.bpmB} BPM, ${data.durationB.toFixed(1)}s
B energy by bar: ${data.energyB || "n/a"}
B drop around bar ${data.dropBarB}, loudest phrase at ${data.peakBSec.toFixed(1)}s`}
Note: ${data.prompt || (data.job === "remix" ? "Club remix. Ride the drop." : "Phrase mix. Bass swap on the 1.")}

JSON:
{
  "job": "${data.job}",
  "targetBpm": number,
  "aOffsetSec": bar-aligned seconds into A (use the loud phrase),
  "bOffsetSec": bar-aligned seconds into B (0 if remix),
  "mixInSec": 0, 8, or 16 bars in seconds,
  "crossfadeSec": 8,
  "holdSec": 16,
  "dropSec": 8 or 16 bars in seconds,
  "bassBoost": -1 to 1,
  "midCut": -1 to 1,
  "air": -1 to 1,
  "pump": true,
  "sweepA": true,
  "cue": "one short booth sentence"
}`,
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
        targetBpm: snapClubBpm(parsed.targetBpm, data.job),
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
