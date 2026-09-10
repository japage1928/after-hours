import type { MixPlan } from "@/lib/dj-api";

type RenderInput = {
  sourceA: AudioBuffer;
  sourceB: AudioBuffer | null;
  bpmA: number;
  bpmB: number;
  offsetA: number;
  offsetB: number;
  plan: MixPlan;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function rmsWindow(data: Float32Array, start: number, end: number) {
  let s = 0;
  const step = 16;
  let n = 0;
  for (let i = start; i < end; i += step) {
    const v = data[i] ?? 0;
    s += v * v;
    n += 1;
  }
  return n ? s / n : 0;
}

function pickHook(buf: AudioBuffer, offset: number, bar: number) {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const skip = buf.duration > 36 ? Math.min(buf.duration * 0.22, Math.max(offset, bar * 6)) : offset;
  const window = bar * 2;
  let bestT = skip;
  let best = -1;
  const last = Math.max(skip + window, buf.duration - bar * 2);
  for (let t = skip; t + window < last; t += bar / 2) {
    const a = Math.floor(t * sr);
    const b = Math.min(data.length, Math.floor((t + window) * sr));
    const r = rmsWindow(data, a, b);
    if (r > best) {
      best = r;
      bestT = t;
    }
  }
  return clamp(bestT, 0, Math.max(0, buf.duration - window));
}

function reverseSlice(ctx: OfflineAudioContext, source: AudioBuffer, startSec: number, durSec: number) {
  const sr = source.sampleRate;
  const a = Math.max(0, Math.floor(startSec * sr));
  const n = Math.max(32, Math.floor(durSec * sr));
  const out = ctx.createBuffer(source.numberOfChannels, n, sr);
  for (let c = 0; c < source.numberOfChannels; c++) {
    const inp = source.getChannelData(c);
    const o = out.getChannelData(c);
    for (let i = 0; i < n; i++) {
      o[i] = inp[a + n - 1 - i] ?? 0;
    }
  }
  return out;
}

function makeKick(ctx: OfflineAudioContext, sr: number) {
  const n = Math.floor(sr * 0.22);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 26);
    const f = 48 + 110 * Math.exp(-t * 38);
    d[i] = Math.sin(2 * Math.PI * f * t) * env;
  }
  return buf;
}

function makeClap(ctx: OfflineAudioContext, sr: number) {
  const n = Math.floor(sr * 0.18);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const burst = t < 0.012 || (t > 0.016 && t < 0.028) || (t > 0.032 && t < 0.042);
    const env = Math.exp(-t * 38);
    d[i] = burst ? (Math.random() * 2 - 1) * env : (Math.random() * 2 - 1) * env * 0.15;
  }
  return buf;
}

function makeHat(ctx: OfflineAudioContext, sr: number) {
  const n = Math.floor(sr * 0.05);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 110);
  }
  return buf;
}

function fire(
  offline: OfflineAudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  when: number,
  gain: number,
) {
  const src = offline.createBufferSource();
  src.buffer = buffer;
  const g = offline.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(dest);
  src.start(when);
}

function playGrain(
  offline: OfflineAudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  when: number,
  offset: number,
  srcDur: number,
  rate: number,
  gain = 1,
) {
  const maxOff = Math.max(0, buffer.duration - 0.02);
  const off = clamp(offset, 0, maxOff);
  const dur = Math.min(srcDur, buffer.duration - off);
  if (dur < 0.02) return;
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = offline.createGain();
  const fade = Math.min(0.012, dur / rate / 4);
  const end = when + dur / rate;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + fade);
  g.gain.setValueAtTime(gain, Math.max(when + fade, end - fade));
  g.gain.linearRampToValueAtTime(0, end);
  src.connect(g);
  g.connect(dest);
  src.start(when, off, dur);
}

function scheduleDrums(
  offline: OfflineAudioContext,
  dest: AudioNode,
  targetBpm: number,
  bars: number,
  dropBar: number,
) {
  const sr = offline.sampleRate;
  const kick = makeKick(offline, sr);
  const clap = makeClap(offline, sr);
  const hat = makeHat(offline, sr);
  const beat = 60 / targetBpm;
  const beats = bars * 4;
  for (let i = 0; i < beats; i++) {
    const t = i * beat;
    const bar = Math.floor(i / 4);
    const inBar = i % 4;
    const dropped = bar >= dropBar;
    fire(offline, kick, dest, t, dropped || inBar === 0 ? 0.95 : 0);
    if (dropped && (inBar === 1 || inBar === 3)) fire(offline, clap, dest, t, 0.55);
    fire(offline, hat, dest, t, dropped ? 0.22 : 0.12);
    fire(offline, hat, dest, t + beat * 0.5, dropped ? 0.16 : 0.08);
    if (dropped && inBar === 3) {
      fire(offline, hat, dest, t + beat * 0.25, 0.14);
      fire(offline, hat, dest, t + beat * 0.75, 0.18);
    }
  }
}

export async function renderRemix(input: RenderInput): Promise<AudioBuffer> {
  const { sourceA, sourceB, plan } = input;
  const sr = sourceA.sampleRate;
  const target = plan.targetBpm;
  const bpmA = Math.max(70, input.bpmA || 120);
  const rateA = clamp(target / bpmA, 0.78, 1.28);
  const barA = (60 / bpmA) * 4;
  const barOut = (60 / target) * 4;
  const bars = 16;
  const outDur = bars * barOut;
  const offline = new OfflineAudioContext(2, Math.ceil(outDur * sr), sr);

  const drums = offline.createGain();
  drums.gain.value = 0.9;
  drums.connect(offline.destination);

  const vocal = offline.createGain();
  vocal.gain.value = 0.62;
  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.Q.value = 0.7;
  hp.frequency.setValueAtTime(720, 0);
  hp.frequency.exponentialRampToValueAtTime(90, barOut * 4);
  const delay = offline.createDelay(0.9);
  delay.delayTime.value = (60 / target) * 0.75;
  const fb = offline.createGain();
  fb.gain.value = 0.28;
  const wet = offline.createGain();
  wet.gain.value = 0.22;
  hp.connect(vocal);
  vocal.connect(offline.destination);
  vocal.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(offline.destination);

  scheduleDrums(offline, drums, target, bars, 4);

  const hookA = pickHook(sourceA, input.offsetA, barA);
  const drop = 4 * barOut;

  for (let bar = 0; bar < 4; bar++) {
    playGrain(offline, sourceA, hp, bar * barOut, hookA, barA / 4, rateA, 0.45);
  }

  const sixA = barA / 16;
  const sixOut = barOut / 16;
  for (let i = 0; i < 8; i++) {
    playGrain(offline, sourceA, hp, drop - barOut + i * sixOut, hookA, sixA, rateA, 0.8);
  }

  for (let bar = 4; bar < 12; bar += 2) {
    playGrain(offline, sourceA, hp, bar * barOut, hookA, barA * 2, rateA, 0.78);
  }

  const rev = reverseSlice(offline, sourceA, hookA, barA / 2);
  playGrain(offline, rev, hp, 12 * barOut, 0, rev.duration, 1, 0.7);

  for (let bar = 14; bar < 16; bar += 2) {
    playGrain(offline, sourceA, hp, bar * barOut, hookA, barA * 2, rateA, 0.72);
  }

  if (sourceB && plan.job === "both") {
    const bpmB = Math.max(70, input.bpmB || bpmA);
    const rateB = clamp(target / bpmB, 0.78, 1.28);
    const barB = (60 / bpmB) * 4;
    const hookB = pickHook(sourceB, input.offsetB, barB);
    const bBus = offline.createGain();
    bBus.gain.value = 0.7;
    bBus.connect(hp);
    for (let bar = 8; bar < 16; bar += 2) {
      playGrain(offline, sourceB, bBus, bar * barOut, hookB, barB * 2, rateB, 0.75);
    }
  }

  return offline.startRendering();
}
