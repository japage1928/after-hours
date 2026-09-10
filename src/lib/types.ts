import { z } from "zod";

export const LengthSchema = z.enum(["hook", "cut", "full"]);
export type Length = z.infer<typeof LengthSchema>;

export const ModeSchema = z.enum(["solo", "mashup"]);
export type Mode = z.infer<typeof ModeSchema>;

export const VocalModeSchema = z.enum(["rap", "sung", "hybrid"]);
export type VocalMode = z.infer<typeof VocalModeSchema>;

export const SectionKindSchema = z.enum([
  "intro",
  "verse",
  "chorus",
  "bridge",
  "outro",
]);
export type SectionKind = z.infer<typeof SectionKindSchema>;

export const SongSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: SectionKindSchema,
  bars: z.number().int().min(2).max(16),
  vocalistId: z.string(),
  lyrics: z.string(),
  chords: z.array(z.string()).min(1).max(16),
});
export type SongSection = z.infer<typeof SongSectionSchema>;

export const SongSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  bpm: z.number().min(60).max(200),
  key: z.string(),
  genre: z.string(),
  explicit: z.boolean(),
  vocalMode: VocalModeSchema,
  mood: z.string(),
  prompt: z.string(),
  mode: ModeSchema,
  vocalistA: z.string(),
  vocalistB: z.string().nullable(),
  sections: z.array(SongSectionSchema).min(1).max(10),
  createdAt: z.string(),
  isDemo: z.boolean().optional(),
});
export type Song = z.infer<typeof SongSchema>;

export const GenerateInputSchema = z.object({
  prompt: z.string().trim().min(2).max(2000),
  mode: ModeSchema,
  explicit: z.boolean(),
  genre: z.string().min(1).max(40),
  vocalistA: z.string().min(1),
  vocalistB: z.string().nullable(),
  length: LengthSchema,
  mashSources: z
    .object({
      titleA: z.string(),
      lyricsA: z.string(),
      titleB: z.string(),
      lyricsB: z.string(),
    })
    .nullable(),
});
export type GenerateInput = z.infer<typeof GenerateInputSchema>;

export const RenderVocalInputSchema = z.object({
  text: z.string().min(1).max(1200),
  voiceId: z.string().min(1),
  vocalMode: VocalModeSchema,
  kind: SectionKindSchema,
});
export type RenderVocalInput = z.infer<typeof RenderVocalInputSchema>;
