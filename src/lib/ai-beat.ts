/**
 * Genre remix beat beds for the AI DJ.
 * Each style is a distinct remix lane — not a generic club groove.
 */

export type GrooveStyle =
  | "edm"
  | "dubstep"
  | "house"
  | "hiphop"
  | "techno"
  | "rock"
  | "country"
  | "pop"
  | "rnb"
  | "breaks";

export const GROOVE_STYLES: {
  id: GrooveStyle;
  label: string;
  blurb: string;
  /** Typical remix tempo — used when the song BPM is unknown. */
  suggestedBpm: number;
}[] = [
  { id: "edm", label: "EDM", blurb: "Festival 4/4, big clap", suggestedBpm: 128 },
  { id: "dubstep", label: "Dubstep", blurb: "Half-time drop, heavy snare", suggestedBpm: 140 },
  { id: "house", label: "House", blurb: "Club kick, rolling hats", suggestedBpm: 124 },
  { id: "hiphop", label: "Hip-hop", blurb: "Boom-bap pocket", suggestedBpm: 92 },
  { id: "techno", label: "Techno", blurb: "Hard pulse, offbeat hats", suggestedBpm: 132 },
  { id: "rock", label: "Rock", blurb: "Backbeat drums, live kit feel", suggestedBpm: 118 },
  { id: "country", label: "Country", blurb: "Train beat / two-step", suggestedBpm: 108 },
  { id: "pop", label: "Pop", blurb: "Radio hook, bright drums", suggestedBpm: 102 },
  { id: "rnb", label: "R&B", blurb: "Smooth pocket, warm bass", suggestedBpm: 88 },
  { id: "breaks", label: "Breaks", blurb: "Broken drums, swing", suggestedBpm: 130 },
];

export function grooveLabel(style: GrooveStyle): string {
  return GROOVE_STYLES.find((g) => g.id === style)?.label ?? style;
}

export function grooveSuggestedBpm(style: GrooveStyle): number {
  return GROOVE_STYLES.find((g) => g.id === style)?.suggestedBpm ?? 120;
}

export function aiBeatDeckName(style: GrooveStyle, bpm: number): string {
  return `AI · ${grooveLabel(style)} remix ${Math.round(bpm)}`;
}

/**
 * Pick a remix BPM: stay near the song, but bias toward the genre’s pocket
 * so a country remix doesn’t sit at 150 or dubstep at 85 unless the song is close.
 */
export function remixBpmForStyle(songBpm: number, style: GrooveStyle): number {
  const target = grooveSuggestedBpm(style);
  const song = Math.max(70, Math.min(180, songBpm || target));
  // Weighted pull toward genre tempo (keeps song identity, lands in the lane).
  const mixed = song * 0.55 + target * 0.45;
  // Dubstep often works as half-time of a fast tune.
  if (style === "dubstep" && song > 120 && song < 160) {
    return Math.round(Math.min(150, Math.max(130, song)));
  }
  return Math.round(Math.max(70, Math.min(180, mixed)));
}

type DrumVoice = "kick" | "snare" | "hat" | "openHat" | "clap";

function writeKick(
  data: Float32Array,
  sr: number,
  at: number,
  velocity = 1,
  deep = false,
) {
  const n = Math.floor((deep ? 0.28 : 0.18) * sr);
  const start = Math.floor(at * sr);
  for (let i = 0; i < n && start + i < data.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * (deep ? 16 : 28)) * velocity;
    const freq = (deep ? 90 : 140) * Math.exp(-t * (deep ? 14 : 22)) + (deep ? 28 : 42);
    data[start + i] += Math.sin(2 * Math.PI * freq * t) * env * 0.95;
  }
}

function writeSnare(
  data: Float32Array,
  sr: number,
  at: number,
  velocity = 1,
  kind: "tight" | "fat" | "snap" = "tight",
) {
  const n = Math.floor((kind === "fat" ? 0.22 : 0.14) * sr);
  const start = Math.floor(at * sr);
  const toneHz = kind === "snap" ? 260 : kind === "fat" ? 160 : 190;
  const noiseAmt = kind === "snap" ? 0.8 : 0.65;
  for (let i = 0; i < n && start + i < data.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * (kind === "fat" ? 12 : 18)) * velocity;
    const tone = Math.sin(2 * Math.PI * toneHz * t) * 0.35;
    const noise = (Math.random() * 2 - 1) * noiseAmt;
    data[start + i] += (tone + noise) * env * 0.72;
  }
}

function writeClap(data: Float32Array, sr: number, at: number, velocity = 0.85) {
  // Layered short bursts ≈ festival clap
  for (const lag of [0, 0.012, 0.024]) {
    const n = Math.floor(0.06 * sr);
    const start = Math.floor((at + lag) * sr);
    for (let i = 0; i < n && start + i < data.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 40) * velocity * (lag === 0 ? 1 : 0.7);
      data[start + i] += (Math.random() * 2 - 1) * env * 0.55;
    }
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
): Record<DrumVoice, number[]> {
  const kick: number[] = [];
  const snare: number[] = [];
  const hat: number[] = [];
  const openHat: number[] = [];
  const clap: number[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const base = bar * 4 * beat;

    switch (style) {
      case "edm": {
        for (let b = 0; b < 4; b++) kick.push(base + b * beat);
        clap.push(base + 1 * beat, base + 3 * beat);
        for (let s = 0; s < 8; s++) hat.push(base + s * (beat / 2));
        openHat.push(base + 3.5 * beat);
        break;
      }
      case "dubstep": {
        // Half-time: kick on 1, snare on 3, sparse hats
        kick.push(base, base + 2.75 * beat);
        if (bar % 2 === 1) kick.push(base + 1.5 * beat);
        snare.push(base + 2 * beat);
        hat.push(base + 0.5 * beat, base + 1.5 * beat, base + 3.5 * beat);
        openHat.push(base + 3 * beat);
        break;
      }
      case "house": {
        for (let b = 0; b < 4; b++) kick.push(base + b * beat);
        snare.push(base + 1 * beat, base + 3 * beat);
        for (let s = 0; s < 8; s++) hat.push(base + s * (beat / 2));
        break;
      }
      case "techno": {
        for (let b = 0; b < 4; b++) kick.push(base + b * beat);
        snare.push(base + 1 * beat, base + 3 * beat);
        for (let s = 0; s < 8; s++) {
          if (s % 2 === 1) hat.push(base + s * (beat / 2));
        }
        openHat.push(base + 1.5 * beat);
        break;
      }
      case "hiphop": {
        kick.push(base, base + 2.5 * beat);
        if (bar % 2 === 1) kick.push(base + 1.75 * beat);
        snare.push(base + 1 * beat, base + 3 * beat);
        for (let s = 0; s < 8; s++) hat.push(base + s * (beat / 2));
        openHat.push(base + 3.5 * beat);
        break;
      }
      case "rock": {
        kick.push(base, base + 2 * beat);
        if (bar % 4 === 3) kick.push(base + 2.5 * beat); // fill-ish
        snare.push(base + 1 * beat, base + 3 * beat);
        for (let s = 0; s < 8; s++) hat.push(base + s * (beat / 2));
        openHat.push(base + 3.75 * beat);
        break;
      }
      case "country": {
        // Train / two-step: kick on 1 (+ sometimes & of 2), snare 2 & 4, shuffle hats
        kick.push(base, base + 2 * beat);
        snare.push(base + 1 * beat, base + 3 * beat);
        for (let s = 0; s < 8; s++) {
          // light swing: delay offbeats a touch via pattern density
          if (s % 2 === 0) hat.push(base + s * (beat / 2));
          else hat.push(base + s * (beat / 2) + beat * 0.06);
        }
        openHat.push(base + 3.5 * beat);
        break;
      }
      case "pop": {
        for (let b = 0; b < 4; b++) kick.push(base + b * beat);
        clap.push(base + 1 * beat, base + 3 * beat);
        for (let s = 0; s < 8; s++) hat.push(base + s * (beat / 2));
        openHat.push(base + 3.5 * beat);
        break;
      }
      case "rnb": {
        kick.push(base, base + 2.5 * beat);
        if (bar % 2 === 1) kick.push(base + 1.75 * beat);
        snare.push(base + 1 * beat, base + 3 * beat);
        for (let s = 0; s < 8; s++) hat.push(base + s * (beat / 2));
        openHat.push(base + 3.5 * beat);
        break;
      }
      case "breaks":
      default: {
        kick.push(base, base + 1.5 * beat, base + 2.75 * beat);
        snare.push(base + 1 * beat, base + 2.25 * beat, base + 3 * beat);
        for (let s = 0; s < 8; s++) {
          if (s !== 2 && s !== 5) hat.push(base + s * (beat / 2));
        }
        openHat.push(base + 1.75 * beat);
        break;
      }
    }
  }
  return { kick, snare, hat, openHat, clap };
}

/** Build a looping genre remix beat bed at `bpm` for `bars` (default 16). */
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
  const style = opts.style;

  const { kick, snare, hat, openHat, clap } = patternHits(style, bars, beat);

  const deepKick = style === "dubstep" || style === "edm";
  const snareKind =
    style === "dubstep" ? "fat" : style === "country" || style === "rock" ? "snap" : "tight";

  for (const t of kick) writeKick(mono, sr, t, style === "dubstep" ? 1.05 : 1, deepKick);
  for (const t of snare) writeSnare(mono, sr, t, style === "dubstep" ? 1.1 : 0.9, snareKind);
  for (const t of clap) writeClap(mono, sr, t, 0.9);
  for (const t of hat) {
    const vel =
      style === "country" ? 0.32 : style === "rock" ? 0.38 : style === "dubstep" ? 0.28 : 0.4;
    writeHat(mono, sr, t, vel, false);
  }
  for (const t of openHat) writeHat(mono, sr, t, 0.55, true);

  const drive =
    style === "rock" || style === "edm" ? 1.25 : style === "dubstep" ? 1.35 : 1.15;

  for (let i = 0; i < mono.length; i++) {
    const s = Math.tanh(mono[i]! * drive);
    // Slight stereo width — rock/country a bit narrower, EDM wider
    const width = style === "rock" || style === "country" ? 0.98 : 0.94;
    L[i] = s;
    R[i] = s * width;
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
