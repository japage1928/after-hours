const PC: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export type Quality = "maj" | "min" | "dom7" | "min7" | "pow" | "dim" | "sus";

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function parseKey(key: string): { pc: number; minor: boolean } {
  const m = key.trim().match(/^([A-G](?:#|b)?)\s*(minor|min|m|major|maj)?/i);
  if (!m) return { pc: 9, minor: true };
  const pc = PC[m[1] ?? "A"] ?? 9;
  const q = (m[2] ?? "").toLowerCase();
  const minor = q === "minor" || q === "min" || q === "m";
  return { pc, minor };
}

export function parseChord(symbol: string): { pc: number; quality: Quality } {
  const s = symbol.trim();
  const m = s.match(/^([A-G](?:#|b)?)(.*)$/i);
  if (!m) return { pc: 9, quality: "min" };
  const pc = PC[m[1] ?? "A"] ?? 9;
  const rest = (m[2] ?? "").toLowerCase();
  if (rest.includes("dim") || rest.includes("°")) return { pc, quality: "dim" };
  if (rest.includes("sus")) return { pc, quality: "sus" };
  if (rest.includes("m7") || rest.includes("min7")) return { pc, quality: "min7" };
  if (rest.includes("7") && !rest.includes("maj")) return { pc, quality: "dom7" };
  if (rest.includes("5") || rest.includes("pow")) return { pc, quality: "pow" };
  if (rest.startsWith("m") || rest.includes("min")) return { pc, quality: "min" };
  return { pc, quality: "maj" };
}

const INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dom7: [0, 4, 7, 10],
  min7: [0, 3, 7, 10],
  pow: [0, 7],
  dim: [0, 3, 6],
  sus: [0, 5, 7],
};

export function chordMidis(symbol: string, octave = 3): number[] {
  const { pc, quality } = parseChord(symbol);
  const root = 12 * (octave + 1) + pc;
  return INTERVALS[quality].map((i) => root + i);
}

export function chordRootMidi(symbol: string, octave = 2): number {
  const { pc } = parseChord(symbol);
  return 12 * (octave + 1) + pc;
}

export function scaleMidis(key: string, octave = 4): number[] {
  const { pc, minor } = parseKey(key);
  const steps = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const root = 12 * (octave + 1) + pc;
  return steps.map((s) => root + s);
}

export function chordAt(chords: string[], barIndex: number): string {
  if (!chords.length) return "Am";
  return chords[barIndex % chords.length] ?? "Am";
}
