import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertAiAllowed, chargeAfterMix } from "@/lib/billing/gate";

/**
 * Intelligent two-deck plan:
 * mashup = beat bed + lyrics/vocals riding together
 * remix  = original song handed onto a new beat
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
  mode: z.enum(["mashup", "remix"]).optional(),
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
  if (/long|smooth|blend|house|mash/.test(p)) return "long_blend";
  if (input.mode === "mashup") return "long_blend";
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
  const mashup = input.mode === "mashup";

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
    mashup
      ? "blend"
      : technique === "power_cut"
        ? "cut"
        : technique === "echo_out"
          ? "echo_fade"
          : "blend";

  const crossfadeSec =
    mashup
      ? Math.min(barA * 8, 28)
      : style === "cut"
        ? Math.max(0.5, barA)
        : technique === "long_blend"
          ? Math.min(barA * 8, 24)
          : Math.min(barA * 4, 16);

  const cues: Record<MixPlan["technique"], string> = {
    bass_swap: mashup
      ? `Lock ${targetBpm}. Ride the beat under the lyrics — bass trade while vocals stay clear.`
      : `Beat-match ${targetBpm}. Hand the song onto the new kick — bass swap over ${Math.round(crossfadeSec)}s.`,
    filter_blend: mashup
      ? `Wash the beat under the lyrics at ${targetBpm}, keep the vocal pocket open.`
      : `Filter the original out as the new beat lands at ${targetBpm}.`,
    power_cut: mashup
      ? `Phrase-match, then snap the lyrics onto the beat at ${targetBpm}.`
      : `Phrase-match, then hard cut onto the new beat at ${targetBpm}.`,
    long_blend: mashup
      ? `Long mash at ${targetBpm} — beats drive, lyrics ride on top.`
      : `Long blend at ${targetBpm} — EQ out the old groove while the new beat takes the floor.`,
    echo_out: mashup
      ? `Ghost the beat in, then lock lyrics over the groove at ${targetBpm}.`
      : `Echo the original out as the new beat lands on the one at ${targetBpm}.`,
  };

  const holdSec = mashup
    ? Math.min(barB * 16, Math.max(12, input.durationB - bOffsetSec - 1))
    : Math.min(barB * 8, input.durationB * 0.45);

  return {
    targetBpm,
    aOffsetSec: 0,
    bOffsetSec,
    mixInSec: Math.max(barA * 4, mixInSec),
    crossfadeSec,
    holdSec,
    sweepA: technique === "filter_blend" || technique === "echo_out",
    bassSwap: technique === "bass_swap" || technique === "long_blend",
    style,
    technique: mashup && technique === "power_cut" ? "long_blend" : technique,
    cue: cues[mashup && technique === "power_cut" ? "long_blend" : technique],
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

function clampPlan(parsed: MixPlan, data: PlanMixInput): MixPlan {
  const aMax = Math.max(0, data.durationA - 2);
  const bMax = Math.max(0, data.durationB - 2);
  const aOffsetSec = Math.min(Math.max(0, parsed.aOffsetSec), aMax);
  const bOffsetSec = Math.min(Math.max(0, parsed.bOffsetSec), bMax);
  const remainingA = Math.max(2, data.durationA - aOffsetSec - 2);
  const mixInSec = Math.min(Math.max(0, parsed.mixInSec), remainingA);
  const crossfadeSec = Math.min(
    Math.max(0.5, parsed.crossfadeSec),
    Math.min(32, Math.max(0.5, remainingA - mixInSec + 4)),
  );
  const remainingB = Math.max(0, data.durationB - bOffsetSec - 0.5);
  const holdSec = Math.min(Math.max(0, parsed.holdSec), remainingB);
  return {
    ...parsed,
    aOffsetSec,
    bOffsetSec,
    mixInSec,
    crossfadeSec,
    holdSec,
  };
}

export const planMix = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => PlanMixInputSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; plan: MixPlan; usedAi: boolean }
      | {
          ok: false;
          error: string;
          plan: MixPlan;
          needsUpgrade: boolean;
          usedAi: false;
        }
    > => {
      const local = fallbackPlan(data);
      const blocked = await assertAiAllowed(context.userId);
      if (blocked) {
        return {
          ok: false,
          error: blocked,
          plan: local,
          needsUpgrade: true,
          usedAi: false,
        };
      }

      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) {
        return { ok: true, plan: local, usedAi: false };
      }

      const boothLabel = data.mode === "mashup" ? "mashup" : "remix";

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
                content: `You are a working club DJ building a REAL two-deck ${boothLabel}.
Product rules:
${
  data.mode === "mashup"
    ? `- Mashup: Deck A is the BEAT BED / instrumental. Deck B is LYRICS / vocals.
- Goal: lock the beat under the lyrics so both ride together — vocals clear, kick driving.
- Prefer long blends and bass trades; avoid wiping the lyrics out.
- Keep both decks audible in the pocket when the mash settles.`
    : `- Remix: Deck A is the ORIGINAL SONG. Deck B is the NEW BEAT / replacement groove.
- Goal: change the beat of the song — phrase-match, then hand the groove to the new kick.
- Prefer bass swaps, filter blends, or a clean power cut onto the new beat.
- Finish with a clean handoff to deck B (the new beat).`
}
Craft:
- Beat-match to one target BPM
- Align phrase boundaries (8/16/32 bars) for mix-in
- Prefer bass swaps (EQ kill lows on outgoing while incoming kick takes over)
Never request copyrighted stems, never clone artist voices, never impersonate named singers. JSON only.`,
              },
              {
                role: "user",
                content: `Mode: ${boothLabel}
Deck A (${data.mode === "mashup" ? "beats" : "song"}): "${data.nameA}" ${data.bpmA} BPM, ${data.durationA.toFixed(1)}s
Deck B (${data.mode === "mashup" ? "lyrics" : "new beat"}): "${data.nameB}" ${data.bpmB} BPM, ${data.durationB.toFixed(1)}s
DJ brief: ${data.prompt || (data.mode === "mashup" ? "Lock beats under lyrics — musical, phrase-aware, vocal-clear." : "Hand the song onto a new beat — phrase-aware, bass-clean.")}

Return JSON:
{
  "targetBpm": number,
  "aOffsetSec": seconds into A to start playback,
  "bOffsetSec": seconds into B where the entry/drop lives,
  "mixInSec": seconds after A starts before B enters (prefer 8/16 bar multiples),
  "crossfadeSec": blend length (0.5-2 for cuts, 8-24 for blends),
  "holdSec": seconds to ride after the handoff,
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
        if (!res.ok) return { ok: true, plan: local, usedAi: false };
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const parsed = MixPlanSchema.parse(
          extractJson(json.choices?.[0]?.message?.content ?? ""),
        );
        const plan = clampPlan(parsed, data);

        try {
          await chargeAfterMix(context.userId);
        } catch {
          // Do not give away a charged AI plan if the ledger write failed.
          return { ok: true, plan: local, usedAi: false };
        }
        return { ok: true, plan, usedAi: true };
      } catch {
        return { ok: true, plan: local, usedAi: false };
      }
    },
  );
