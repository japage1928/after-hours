/**
 * Synthesized AI DJ beat beds — enough groove for a live remix handoff
 * without requiring the user to upload a second file.
 */

export type GrooveStyle = "house" | "hiphop" | "techno" | "breaks";

export const GROOVE_STYLES: {
  id: GrooveStyle;
  label: string;
  blurb: string;
}[] = [
  { id: "house", label: "House", blurb: "4-on-the-floor, club kick" },
  { id: "hiphop", label: "Hip-hop", blurb: "Boom-bap pocket" },
  { id: "techno", label: "Techno", blurb: "Hard pulse, offbeat hats" },
  { id: "breaks", label: "Breaks", blurb: "Broken drums, swing" },
];

export function grooveLabel(style: GrooveStyle): string {
  return GROOVE_STYLES.find((g) => g.id === style)?.label ?? style;
}

export function aiBeatDeckName(style: GrooveStyle, bpm: number): string {
  return `AI DJ · ${grooveLabel(style)} ${Math.round(bpm)}`;
}

function writeKick(
  data: Float32Array,
  sr: number,
  at: number,
  velocity = 1,
) {
  const n = Math.floor(0.18 * sr);
  const start = Math.floor(at * sr);
  for (let i = 0; i < n && start + i < data.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 28) * velocity;
    const freq = 140 * Math.exp(-t * 22) + 42;
    data[start + i] += Math.sin(2 * Math.PI * freq * t) * env * 0.95;
  }
}

function writeSnare(
  data: Float32Array,
  sr: number,
  at: number,
  velocity = 1,
) {
  const n = Math.floor(0.14 * sr);
  const start = Math.floor(at * sr);
  for (let i = 0; i < n && start + i < data.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 18) * velocity;
    const tone = Math.sin(2 * Math.PI * 190 * t) * 0.35;
    const noise = (Math.random() * 2 - 1) * 0.65;
    data[start + i] += (tone + noise) * env * 0.7;
  }
}

function writeHat(
  data: Float32Array,
  sr: number,
  at: number,
  velocity = 0.45,
  open = false,
) {
  const n = Math.floor((open ? 0.12 : 0.04) * sr);
  const start = Math.floor(at * sr);
  const decay = open ? 14 : 55;
  for (let i = 0; i < n && start + i < data.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * decay) * velocity;
    data[start + i] += (Math.random() * 2 - 1) * env * 0.35;
  }
}

function patternHits(
  style: GrooveStyle,
  bars: number,
  beat: number,
): { kick: number[]; snare: number[]; hat: number[]; openHat: number[] } {
  const kick: number[] = [];
  const snare: number[] = [];
  const hat: number[] = [];
  const openHat: number[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const base = bar * 4 * beat;
    if (style === "house" || style === "techno") {
      for (let b = 0; b < 4; b++) kick.push(base + b * beat);
      snare.push(base + 1 * beat, base + 3 * beat);
      for (let s = 0; s < 8; s++) {
        const t = base + s * (beat / 2);
        if (style === "techno" && s % 2 === 1) hat.push(t);
        else if (style === "house") hat.push(t);
      }
      if (style === "techno") openHat.push(base + 1.5 * beat);
    } else if (style === "hiphop") {
      kick.push(base, base + 2.5 * beat);
      if (bar % 2 === 1) kick.push(base + 1.75 * beat);
      snare.push(base + 1 * beat, base + 3 * beat);
      for (let s = 0; s < 8; s++) hat.push(base + s * (beat / 2));
      openHat.push(base + 3.5 * beat);
    } else {
      // breaks — syncopated
      kick.push(base, base + 1.5 * beat, base + 2.75 * beat);
      snare.push(base + 1 * beat, base + 2.25 * beat, base + 3 * beat);
      for (let s = 0; s < 8; s++) {
        if (s !== 2 && s !== 5) hat.push(base + s * (beat / 2));
      }
      openHat.push(base + 1.75 * beat);
    }
  }
  return { kick, snare, hat, openHat };
}

/** Build a looping AI DJ beat bed at `bpm` for `bars` (default 16). */
export function renderAiBeat(
  ctx: AudioContext | OfflineAudioContext,
  opts: { bpm: number; style: GrooveStyle; bars?: number },
): AudioBuffer {
  const bpm = Math.max(70, Math.min(180, opts.bpm));
  const bars = opts.bars ?? 16;
  const beat = 60 / bpm;
  const duration = bars * 4 * beat;
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(2, Math.ceil(duration * sr), sr);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const mono = new Float32Array(L.length);

  const { kick, snare, hat, openHat } = patternHits(opts.style, bars, beat);
  for (const t of kick) writeKick(mono, sr, t, 1);
  for (const t of snare) writeSnare(mono, sr, t, 0.9);
  for (const t of hat) writeHat(mono, sr, t, 0.4, false);
  for (const t of openHat) writeHat(mono, sr, t, 0.55, true);

  // Soft stereo + light saturation ceiling
  for (let i = 0; i < mono.length; i++) {
    const s = Math.tanh(mono[i] * 1.15);
    L[i] = s;
    R[i] = s * 0.96;
  }
  return buffer;
}

/** Peak strip for deck UI when BPM is known and buffer is synthetic. */
export function syntheticPeaks(buffer: AudioBuffer, buckets = 80): number[] {
  const ch = buffer.getChannelData(0);
  const size = Math.floor(ch.length / buckets) || 1;
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const start = b * size;
    const end = Math.min(ch.length, start + size);
    for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(ch[i]!));
    peaks.push(Math.min(1, peak * 1.4));
  }
  return peaks;
}
