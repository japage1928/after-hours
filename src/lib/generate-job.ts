import { AceStepJobSchema, type AceStepJob } from "./ace-step.ts";
import { GROOVE_STYLES, type GrooveStyle } from "./ai-beat.ts";

export type GenerateJobInput = {
  prompt: string;
  style: GrooveStyle | string;
  lyrics?: string;
  durationSec: number;
  instrumental?: boolean;
};

function genreMeta(id: string) {
  return GROOVE_STYLES.find((g) => g.id === id) ?? GROOVE_STYLES[0]!;
}

export function taggedLyrics(raw: string, prompt: string): string {
  const text = raw.trim();
  if (!text) {
    const line = prompt.trim().slice(0, 180) || "original hook";
    return `[Verse]\n${line}\n[Chorus]\n${line}`;
  }
  if (/\[(verse|chorus|bridge|intro|outro)\]/i.test(text)) return text.slice(0, 8000);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const mid = Math.max(1, Math.floor(lines.length / 2));
  const verse = lines.slice(0, mid).join("\n") || text;
  const chorus = lines.slice(mid).join("\n") || lines[0] || text;
  return `[Verse]\n${verse}\n[Chorus]\n${chorus}`.slice(0, 8000);
}

export function fallbackGenerateJob(input: GenerateJobInput): AceStepJob {
  const g = genreMeta(input.style);
  const instrumental = Boolean(input.instrumental) && !input.lyrics?.trim();
  const lyrics = instrumental
    ? "[Instrumental]"
    : taggedLyrics(input.lyrics ?? "", input.prompt);

  const caption = [
    `${g.label} song`,
    g.blurb,
    input.prompt.trim().slice(0, 400),
    instrumental ? "instrumental, no vocals" : "lead vocal, original composition",
    "modern production, punchy drums, clear mix, original music only",
  ].join(", ");

  return AceStepJobSchema.parse({
    caption: caption.slice(0, 1200),
    lyrics,
    bpm: g.suggestedBpm,
    durationSec: Math.round(Math.min(120, Math.max(20, input.durationSec))),
    vocalLanguage: "en",
    instrumental,
    summary: `${g.label}: ${input.prompt.trim().slice(0, 80) || "new song"}`,
  });
}
