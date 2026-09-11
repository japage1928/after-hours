import { AceStepJobSchema, type AceStepJob } from "./ace-step.ts";
import { GROOVE_STYLES, type GrooveStyle } from "./ai-beat.ts";

export type RemixJobInput = {
  brief: string;
  genre: GrooveStyle | string;
  songName: string;
  songBpm: number;
  songDurationSec: number;
  instrumental?: boolean;
};

function genreMeta(id: string) {
  return GROOVE_STYLES.find((g) => g.id === id) ?? GROOVE_STYLES[0]!;
}

/** Full-listen remix bed — match the source song, not a 16-bar loop. */
export function remixBedDurationSec(songDurationSec: number): number {
  return Math.min(90, Math.max(32, Math.round(songDurationSec || 48)));
}

/** Local fallback when the LLM is unavailable — still ACE-Step-shaped. */
export function fallbackAceStepJob(input: RemixJobInput): AceStepJob {
  const g = genreMeta(input.genre);
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
    durationSec: remixBedDurationSec(input.songDurationSec),
    vocalLanguage: "en",
    instrumental: true,
    summary: `${g.label} remix bed for ${input.songName}`,
  });
}
