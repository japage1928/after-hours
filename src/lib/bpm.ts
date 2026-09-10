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

  let offset = 0;
  const thresh = 0.35 * Math.max(...Array.from(env.subarray(0, Math.min(env.length, ENV_RATE * 4))));
  for (let i = 0; i < Math.min(env.length, ENV_RATE * 8); i++) {
    if ((env[i] ?? 0) >= thresh) {
      offset = i / ENV_RATE;
      break;
    }
  }

  return { bpm, offset, peaks: waveformPeaks(buffer) };
}
