export function snapClubBpm(bpm: number, job: "mashup" | "remix" | "both" | "stems") {
  if (job === "stems") return Math.min(180, Math.max(70, bpm));
  const x = Math.min(150, Math.max(100, bpm));
  if (job === "mashup") return Math.round(x);
  if (x < 122) return 126;
  if (x <= 132) return 128;
  return 140;
}

export type BpmGuess = {
  bpm: number;
  offset: number;
  peaks: number[];
};

const ENV_RATE = 400;

export function waveformPeaks(buffer: AudioBuffer, bars = 80): number[] {
  const data = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / bars));
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    const start = i * block;
    const end = Math.min(data.length, start + block);
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j] ?? 0);
      if (v > peak) peak = v;
    }
    out.push(Math.min(1, peak));
  }
  return out;
}

export function detectBpm(buffer: AudioBuffer): BpmGuess {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const hop = Math.max(1, Math.floor(sr / ENV_RATE));
  const n = Math.floor(ch0.length / hop);
  const env = new Float32Array(Math.max(1, n));
  for (let i = 0; i < n; i++) {
    let peak = 0;
    const start = i * hop;
    const end = Math.min(ch0.length, start + hop);
    for (let j = start; j < end; j++) {
      const v = Math.abs(ch0[j] ?? 0);
      if (v > peak) peak = v;
    }
    env[i] = peak;
  }
  for (let i = n - 1; i > 0; i--) {
    env[i] = Math.max(0, env[i] - env[i - 1] * 0.85);
  }

  const minBpm = 72;
  const maxBpm = 178;
  const minLag = Math.round((60 / maxBpm) * ENV_RATE);
  const maxLag = Math.round((60 / minBpm) * ENV_RATE);
  const window = Math.min(n, ENV_RATE * 24);
  let bestLag = minLag;
  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = Math.min(window, n - lag);
    for (let i = 0; i < limit; i++) sum += env[i] * env[i + lag];
    const scored = sum / Math.max(1, limit);
    if (scored > best) {
      best = scored;
      bestLag = lag;
    }
  }

  let bpm = (60 * ENV_RATE) / bestLag;
  if (bpm < 80) bpm *= 2;
  if (bpm > 168) bpm /= 2;
  bpm = Math.round(bpm * 2) / 2;
  bpm = Math.min(178, Math.max(72, bpm));

  const beatEnv = (60 / bpm) * ENV_RATE;
  let bestOff = 0;
  let bestScore = -1;
  const search = Math.min(env.length, Math.max(1, Math.round(beatEnv * 4)));
  for (let off = 0; off < search; off++) {
    let s = 0;
    for (let k = 0; k < 24; k++) {
      const i = Math.round(off + k * beatEnv);
      if (i >= env.length) break;
      s += env[i] ?? 0;
    }
    if (s > bestScore) {
      bestScore = s;
      bestOff = off;
    }
  }
  const offset = bestOff / ENV_RATE;

  return { bpm, offset, peaks: waveformPeaks(buffer) };
}

export type TrackAnalysis = {
  bars: number;
  dropBar: number;
  peakSec: number;
  energy: number[];
};

function mean(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function analyzeTrack(buffer: AudioBuffer, bpm: number, offset: number): TrackAnalysis {
  const bar = (60 / Math.max(70, bpm)) * 4;
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const start = Math.max(0, offset);
  const bars = Math.max(1, Math.floor((buffer.duration - start) / bar));
  const energy: number[] = [];
  for (let i = 0; i < bars; i++) {
    const a = Math.floor((start + i * bar) * sr);
    const b = Math.min(data.length, Math.floor((start + (i + 1) * bar) * sr));
    let s = 0;
    let n = 0;
    for (let j = a; j < b; j += 32) {
      const v = data[j] ?? 0;
      s += v * v;
      n += 1;
    }
    energy.push(n ? Math.sqrt(s / n) : 0);
  }
  let dropBar = Math.min(16, Math.max(8, Math.floor(bars * 0.3)));
  let bestJump = -1;
  for (let i = 4; i < Math.max(5, bars - 8); i += 4) {
    const before = mean(energy.slice(Math.max(0, i - 4), i));
    const after = mean(energy.slice(i, Math.min(bars, i + 4)));
    const jump = after - before;
    if (jump > bestJump) {
      bestJump = jump;
      dropBar = i;
    }
  }
  let peakI = Math.min(dropBar, Math.max(0, bars - 8));
  let peakR = -1;
  for (let i = 0; i <= Math.max(0, bars - 8); i += 4) {
    const s = mean(energy.slice(i, i + 8));
    if (s > peakR) {
      peakR = s;
      peakI = i;
    }
  }
  return {
    bars,
    dropBar,
    peakSec: start + peakI * bar,
    energy,
  };
}
