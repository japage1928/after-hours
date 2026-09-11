import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Intelligent two-deck remix plan using real DJ technique:
 * beat-match → phrase-aware entry → EQ bass swap → crossfade or power cut.
 */
export const MixPlanSchema = z.object({
  targetBpm: z.number().min(70).max(180),
  aOffsetSec: z.number().min(0).max(600),
  bOffsetSec: z.number().min(0).max(600),
  mixInSec: z.number().min(0).max(180),
  crossfadeSec: z.number().min(0.5).max(40),
  holdSec: z.number().min(0).max(90),
  /** Filter-sweep the outgoing deck during the blend. */
  sweepA: z.boolean(),
  /** Classic DJ bass swap: kill lows on A while bringing lows on B. */
  bassSwap: z.boolean(),
  /** hard cut vs long blend */
  style: z.enum(["blend", "cut", "echo_fade"]),
  technique: z.enum([
    "bass_swap",
    "filter_blend",
    "power_cut",
    "long_blend",
    "echo_out",
  ]),
  cue: z.string().max(280),
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

function nearestBar(seconds: number, bpm: number): number {
  const bar = (60 / Math.max(60, bpm)) * 4;
  return Math.max(0, Math.round(seconds / bar) * bar);
}

function pickTechnique(
  input: PlanMixInput,
  prompt: string,
): MixPlan["technique"] {
  const p = prompt.toLowerCase();
  if (/cut|drop|slam|power/.test(p)) return "power_cut";
  if (/echo|delay|out/.test(p)) return "echo_out";
  if (/filter|sweep|wash/.test(p)) return "filter_blend";
  if (/long|smooth|blend|house/.test(p)) return "long_blend";
  const bpmGap = Math.abs(input.bpmA - input.bpmB);
  if (bpmGap > 12) return "filter_blend";
  if (input.bpmA >= 128 && input.bpmB >= 128) return "bass_swap";
  return "long_blend";
}

/** Bar-aligned local remix plan when the model is unavailable. */
export function fallbackPlan(input: PlanMixInput): MixPlan {
  const technique = pickTechnique(input, input.prompt);
  const targetBpm = Math.round((input.bpmA + input.bpmB) / 2);
  const barA = (60 / input.bpmA) * 4;
  const barB = (60 / input.bpmB) * 4;

  // Enter after an 8–16 bar phrase on A; cue B near a likely drop (bar 8/16).
  const phraseBars = input.durationA > barA * 24 ? 16 : 8;
  const mixInSec = nearestBar(
    Math.min(input.durationA * 0.42, barA * phraseBars),
    input.bpmA,
  );
  const bOffsetSec = nearestBar(
    input.durationB > barB * 16 ? barB * 8 : barB * 4,
    input.bpmB,
  );

  const style: MixPlan["style"] =
    technique === "power_cut"
      ? "cut"
      : technique === "echo_out"
        ? "echo_fade"
        : "blend";

  const crossfadeSec =
    style === "cut"
      ? Math.max(0.5, barA)
      : technique === "long_blend"
        ? Math.min(barA * 8, 24)
        : Math.min(barA * 4, 16);

  const cues: Record<MixPlan["technique"], string> = {
    bass_swap: `Beat-match ${targetBpm}. Ride A, kill the bass on A, bring B’s kick in over ${Math.round(crossfadeSec)}s.`,
    filter_blend: `Open a high-pass on A into the mix, lock ${targetBpm}, wash into B.`,
    power_cut: `Phrase-match, then hard cut to B on the downbeat at ${targetBpm}.`,
    long_blend: `Long blend at ${targetBpm} — EQ out A’s lows while B takes the floor.`,
    echo_out: `Echo A out as B lands on the one at ${targetBpm}.`,
  };

  return {
    targetBpm,
    aOffsetSec: 0,
    bOffsetSec,
    mixInSec: Math.max(barA * 4, mixInSec),
    crossfadeSec,
    holdSec: Math.min(barB * 8, input.durationB * 0.45),
    sweepA: technique === "filter_blend" || technique === "echo_out",
    bassSwap: technique === "bass_swap" || technique === "long_blend",
    style,
    technique,
    cue: cues[technique],
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
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; plan: MixPlan } | { ok: false; error: string; plan: MixPlan }
    > => {
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
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            model: "grok-4.5",
            temperature: 0.35,
            max_tokens: 500,
            reasoning_effort: "low",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You are a working club DJ building a REAL two-deck remix transition — not a random crossfade.
Use standard DJ craft:
- Beat-match to one target BPM
- Align phrase boundaries (8/16/32 bars) for mix-in
- Prefer bass swaps (EQ kill lows on outgoing while incoming kick takes over)
- Use filter sweeps or echo-outs when tastes call for it
- Power cuts only on clear phrase ends
Never request copyrighted stems, never clone artist voices, never impersonate named singers. JSON only.`,
              },
              {
                role: "user",
                content: `Deck A: "${data.nameA}" ${data.bpmA} BPM, ${data.durationA.toFixed(1)}s
Deck B: "${data.nameB}" ${data.bpmB} BPM, ${data.durationB.toFixed(1)}s
DJ brief: ${data.prompt || "Club-ready remix transition — musical, phrase-aware, bass-clean."}

Return JSON:
{
  "targetBpm": number,
  "aOffsetSec": seconds into A to start playback,
  "bOffsetSec": seconds into B where the entry/drop lives,
  "mixInSec": seconds after A starts before B enters (prefer 8/16 bar multiples),
  "crossfadeSec": blend length (0.5-2 for cuts, 8-24 for blends),
  "holdSec": seconds to ride B after the handoff,
  "sweepA": boolean,
  "bassSwap": boolean,
  "style": "blend" | "cut" | "echo_fade",
  "technique": "bass_swap" | "filter_blend" | "power_cut" | "long_blend" | "echo_out",
  "cue": "one short DJ cue describing the move"
}
Offsets must fit each track. mixInSec + crossfadeSec must fit remaining A.`,
              },
            ],
          }),
        });
        if (!res.ok) return { ok: true, plan: local };
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const parsed = MixPlanSchema.parse(
          extractJson(json.choices?.[0]?.message?.content ?? ""),
        );
        const aMax = Math.max(0, data.durationA - 2);
        const bMax = Math.max(0, data.durationB - 2);
        const plan: MixPlan = {
          ...parsed,
          aOffsetSec: Math.min(parsed.aOffsetSec, aMax),
          bOffsetSec: Math.min(parsed.bOffsetSec, bMax),
          mixInSec: Math.min(
            parsed.mixInSec,
            Math.max(2, data.durationA - parsed.aOffsetSec - 2),
          ),
          crossfadeSec: Math.min(parsed.crossfadeSec, 32),
        };
        return { ok: true, plan };
      } catch {
        return { ok: true, plan: local };
      }
    },
  );
