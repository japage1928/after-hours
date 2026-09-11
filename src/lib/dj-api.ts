import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertAiAllowed, chargeAfterMix } from "@/lib/billing/gate";

/**
 * AI DJ performance plan for two decks.
 * Mashup = beat bed + lyrics riding together.
 * Remix = AI DJ remixes the song onto a new beat (intro → tease → drop → ride).
 */
export const MixPlanSchema = z.object({
  targetBpm: z.number().min(70).max(180),
  aOffsetSec: z.number().min(0).max(600),
  bOffsetSec: z.number().min(0).max(600),
  /** Seconds riding deck A alone before the incoming deck is armed. */
  introSec: z.number().min(0).max(90).default(0),
  /** Seconds teasing the incoming deck before the main drop/blend. */
  teaseSec: z.number().min(0).max(48).default(0),
  /** Legacy: seconds after A starts before B enters. Prefer introSec. */
  mixInSec: z.number().min(0).max(180),
  crossfadeSec: z.number().min(0.5).max(40),
  holdSec: z.number().min(0).max(90),
  sweepA: z.boolean(),
  bassSwap: z.boolean(),
  style: z.enum(["blend", "cut", "echo_fade"]),
  technique: z.enum([
    "bass_swap",
    "filter_blend",
    "power_cut",
    "long_blend",
    "echo_out",
  ]),
  /** Headline cue for the whole performance. */
  cue: z.string().max(280),
  /** Live DJ calls spoken as status during the performance (in order). */
  calls: z.array(z.string().max(120)).max(6).default([]),
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
  return "bass_swap";
}

/** Bar-aligned local plan when the model is unavailable. */
export function fallbackPlan(input: PlanMixInput): MixPlan {
  const technique = pickTechnique(input, input.prompt);
  const targetBpm = Math.round((input.bpmA + input.bpmB) / 2);
  const barA = (60 / input.bpmA) * 4;
  const barB = (60 / input.bpmB) * 4;
  const mashup = input.mode === "mashup";

  const phraseBars = input.durationA > barA * 24 ? 16 : 8;
  const introSec = nearestBar(
    mashup
      ? Math.min(input.durationA * 0.2, barA * 4)
      : Math.min(input.durationA * 0.28, barA * phraseBars),
    input.bpmA,
  );
  const teaseSec = nearestBar(
    mashup ? Math.min(barA * 4, 16) : Math.min(barA * 4, 12),
    input.bpmA,
  );
  const mixInSec = Math.max(barA * 2, introSec);
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

  const tech =
    mashup && technique === "power_cut" ? "long_blend" : technique;

  const cues: Record<MixPlan["technique"], string> = {
    bass_swap: mashup
      ? `AI locks ${targetBpm} — beat under lyrics, bass trade, vocals clear.`
      : `AI DJ remix @ ${targetBpm} — ride the song, tease the new kick, bass-swap the drop.`,
    filter_blend: mashup
      ? `AI washes the beat under the lyrics at ${targetBpm}.`
      : `AI DJ remix @ ${targetBpm} — filter the original out as the new beat lands.`,
    power_cut: mashup
      ? `AI snaps lyrics onto the beat at ${targetBpm}.`
      : `AI DJ remix @ ${targetBpm} — phrase ride, then power-cut onto the new beat.`,
    long_blend: mashup
      ? `AI mash at ${targetBpm} — beats drive, lyrics ride.`
      : `AI DJ remix @ ${targetBpm} — long blend onto the new groove.`,
    echo_out: mashup
      ? `AI ghosts the beat in under the lyrics at ${targetBpm}.`
      : `AI DJ remix @ ${targetBpm} — echo the original out onto the new beat.`,
  };

  const calls = mashup
    ? [
        "Riding the beat bed…",
        "Bringing lyrics into the pocket…",
        "Locking the mash — both decks up.",
      ]
    : [
        "AI DJ riding the original…",
        "Teasing the new beat…",
        style === "cut"
          ? "Power cut — new beat takes the floor."
          : "Dropping the remix — handing the groove over.",
        "Riding the new beat.",
      ];

  const holdSec = mashup
    ? Math.min(barB * 16, Math.max(12, input.durationB - bOffsetSec - 1))
    : Math.min(barB * 8, input.durationB * 0.45);

  return {
    targetBpm,
    aOffsetSec: 0,
    bOffsetSec,
    introSec,
    teaseSec,
    mixInSec,
    crossfadeSec,
    holdSec,
    sweepA: tech === "filter_blend" || tech === "echo_out",
    bassSwap: tech === "bass_swap" || tech === "long_blend",
    style,
    technique: tech,
    cue: cues[tech],
    calls,
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

  let introSec = Math.min(Math.max(0, parsed.introSec ?? 0), remainingA * 0.7);
  let teaseSec = Math.min(Math.max(0, parsed.teaseSec ?? 0), 40);
  // Prefer explicit intro; fall back to legacy mixInSec as "B enters after".
  const legacyMixIn = Math.min(Math.max(0, parsed.mixInSec), remainingA);
  if (introSec < 0.05 && legacyMixIn > 0.05) {
    introSec = Math.min(legacyMixIn, remainingA * 0.7);
  }
  if (introSec + teaseSec > remainingA - 1) {
    teaseSec = Math.max(0, remainingA - introSec - 1);
  }
  const mixInSec = introSec; // B arms when intro ends
  const crossfadeSec = Math.min(
    Math.max(0.5, parsed.crossfadeSec),
    Math.min(32, Math.max(0.5, remainingA - mixInSec - teaseSec + 4)),
  );
  const remainingB = Math.max(0, data.durationB - bOffsetSec - 0.5);
  const holdSec = Math.min(Math.max(0, parsed.holdSec), remainingB);
  const calls = (parsed.calls ?? [])
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 6);

  return {
    ...parsed,
    aOffsetSec,
    bOffsetSec,
    introSec,
    teaseSec,
    mixInSec,
    crossfadeSec,
    holdSec,
    calls,
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
            temperature: 0.4,
            max_tokens: 700,
            reasoning_effort: "low",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You ARE a genre remix producer on two decks — not a generic club DJ writing notes. You perform a live ${boothLabel}.

You control: beat-match BPM, cue points, intro ride, tease, drop technique, EQ bass swaps, filter sweeps, and the ride-out.

${
  data.mode === "mashup"
    ? `MASHUP rules:
- Deck A = BEAT BED / instrumental. Deck B = LYRICS / vocals.
- Perform: ride beats → bring lyrics in → lock both in the pocket.
- Vocals stay clear; kick drives. Prefer long blends / bass trades.`
    : `REMIX rules (genre AI remix):
- Deck A = ORIGINAL SONG. Deck B = GENRE BEAT (EDM, dubstep, house, hip-hop, techno, rock, country, or breaks — read the beat name + brief).
- Match the remix lane: EDM festival builds/claps, dubstep half-time drops, rock backbeats, country train-beat pockets, etc.
- Perform: INTRO (ride the song) → TEASE (hint the genre beat) → DROP → RIDE the new beat.
- Finish on deck B. Cue language should name the genre when clear.`
}

Never request copyrighted stems, never clone artist voices, never impersonate named singers. JSON only.`,
              },
              {
                role: "user",
                content: `Mode: ${boothLabel}
Deck A (${data.mode === "mashup" ? "beats" : "song"}): "${data.nameA}" ${data.bpmA} BPM, ${data.durationA.toFixed(1)}s
Deck B (${data.mode === "mashup" ? "lyrics" : "new beat"}): "${data.nameB}" ${data.bpmB} BPM, ${data.durationB.toFixed(1)}s
DJ brief: ${
                  data.prompt ||
                  (data.mode === "mashup"
                    ? "Lock beats under lyrics — musical, phrase-aware, vocal-clear."
                    : "Genre remix — ride, tease, drop onto the new beat in that lane.")
                }

Return JSON for your live performance:
{
  "targetBpm": number,
  "aOffsetSec": where you start deck A,
  "bOffsetSec": where the new entry/drop lives on B,
  "introSec": seconds riding A alone (prefer 8/16 bar multiples),
  "teaseSec": seconds teasing B before the main drop (0-16),
  "mixInSec": same as introSec (B arms when intro ends),
  "crossfadeSec": drop/blend length,
  "holdSec": ride-out after the drop,
  "sweepA": boolean,
  "bassSwap": boolean,
  "style": "blend" | "cut" | "echo_fade",
  "technique": "bass_swap" | "filter_blend" | "power_cut" | "long_blend" | "echo_out",
  "cue": "one headline describing your remix move",
  "calls": ["4 short live DJ calls in performance order"]
}
Offsets must fit each track. intro + tease + crossfade must fit remaining A.`,
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
          return { ok: true, plan: local, usedAi: false };
        }
        return { ok: true, plan, usedAi: true };
      } catch {
        return { ok: true, plan: local, usedAi: false };
      }
    },
  );
