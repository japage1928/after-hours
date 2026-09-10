import type { MixPlan } from "@/lib/dj-api";
import { snapClubBpm } from "@/lib/bpm";

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
  let n = 0;
  for (let i = start; i < end; i += 16) {
    const v = data[i] ?? 0;
    s += v * v;
    n += 1;
  }
  return n ? s / n : 0;
}

function quantize(t: number, bar: number, grid: number) {
  const n = Math.round((t - grid) / bar);
  return Math.max(grid, grid + n * bar);
}

function pickPhrase(buf: AudioBuffer, offset: number, bar: number, bars = 8) {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const grid = offset % bar;
  const fit = Math.max(2, Math.floor(Math.max(bar * 2, buf.duration - grid) / bar));
  bars = Math.min(bars, fit);
  const window = bar * bars;
  const skip = buf.duration > 40 ? quantize(Math.max(offset, bar * 8), bar, grid) : grid;
  let bestT = skip;
  let best = -1;
  const last = Math.max(skip + window, buf.duration - window);
  for (let t = skip; t + window <= last + 0.001; t += bar) {
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
    for (let i = 0; i < n; i++) o[i] = inp[a + n - 1 - i] ?? 0;
  }
  return out;
}

function makeKick(ctx: OfflineAudioContext, sr: number) {
  const n = Math.floor(sr * 0.36);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 47 + 145 * Math.exp(-t * 48);
    phase += (2 * Math.PI * f) / sr;
    const body = Math.sin(phase) * Math.exp(-t * 12.5);
    const click = Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t * 95) * 0.28;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 130) * 0.12;
    d[i] = Math.tanh((body + click + noise) * 1.55);
  }
  return buf;
}

function makeClap(ctx: OfflineAudioContext, sr: number) {
  const n = Math.floor(sr * 0.22);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const bursts =
      Math.exp(-Math.abs(t) * 70) * 0.5 +
      Math.exp(-Math.abs(t - 0.012) * 80) +
      Math.exp(-Math.abs(t - 0.026) * 70) * 0.7 +
      Math.exp(-Math.abs(t - 0.041) * 55) * 0.45;
    d[i] = (Math.random() * 2 - 1) * bursts * Math.exp(-t * 16);
  }
  return buf;
}

function makeHat(ctx: OfflineAudioContext, sr: number, open: boolean) {
  const n = Math.floor(sr * (open ? 0.22 : 0.045));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const decay = open ? 18 : 120;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const raw = Math.random() * 2 - 1;
    const bright = i > 0 ? raw - (d[i - 1] ?? 0) * 0.4 : raw;
    d[i] = bright * Math.exp(-t * decay);
  }
  return buf;
}

function fire(
  offline: OfflineAudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  when: number,
  gain: number,
  pan = 0,
) {
  if (gain <= 0) return;
  const src = offline.createBufferSource();
  src.buffer = buffer;
  const g = offline.createGain();
  g.gain.value = gain;
  const p = offline.createStereoPanner();
  p.pan.value = pan;
  src.connect(g);
  g.connect(p);
  p.connect(dest);
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
  gain: number,
) {
  const maxOff = Math.max(0, buffer.duration - 0.03);
  const off = clamp(offset, 0, maxOff);
  const dur = Math.min(srcDur, buffer.duration - off);
  if (dur < 0.03 || gain <= 0) return;
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = offline.createGain();
  const outDur = dur / rate;
  const fade = Math.min(0.018, outDur / 6);
  const end = when + outDur;
  g.gain.setValueAtTime(0, Math.max(0, when));
  g.gain.linearRampToValueAtTime(gain, when + fade);
  g.gain.setValueAtTime(gain, Math.max(when + fade, end - fade));
  g.gain.linearRampToValueAtTime(0, end);
  src.connect(g);
  g.connect(dest);
  src.start(when, off, dur);
}

function duckToKick(gain: GainNode, times: number[], beat: number, peak = 0.72) {
  for (const t of times) {
    const a = Math.max(0, t);
    try {
      gain.gain.setValueAtTime(peak, a);
      gain.gain.linearRampToValueAtTime(0.22, a + 0.028);
      gain.gain.exponentialRampToValueAtTime(peak, a + beat * 0.82);
    } catch {
      /* ramp collision */
    }
  }
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
  const hat = makeHat(offline, sr, false);
  const open = makeHat(offline, sr, true);
  const beat = 60 / targetBpm;
  const kicks: number[] = [];
  const beats = bars * 4;
  for (let i = 0; i < beats; i++) {
    const t = i * beat;
    const bar = Math.floor(i / 4);
    const inBar = i % 4;
    const dropped = bar >= dropBar;
    const breakdown = bar >= bars - 8 && bar < bars - 4;
    if (!breakdown || inBar === 0) {
      fire(offline, kick, dest, t, dropped || inBar === 0 ? 0.92 : 0);
      if (dropped || inBar === 0) kicks.push(t);
    }
    if (dropped && !breakdown && (inBar === 1 || inBar === 3)) {
      fire(offline, clap, dest, t, 0.48, 0.12);
    }
    const hatGain = dropped && !breakdown ? 0.16 : 0.09;
    fire(offline, hat, dest, t, hatGain, -0.35);
    fire(offline, hat, dest, t + beat * 0.5, hatGain * 0.75, 0.4);
    if (dropped && !breakdown && inBar === 3) {
      fire(offline, open, dest, t + beat * 0.5, 0.12, 0.15);
      fire(offline, hat, dest, t + beat * 0.25, 0.1, -0.2);
      fire(offline, hat, dest, t + beat * 0.75, 0.13, 0.25);
    }
  }
  return kicks;
}

function bus(offline: OfflineAudioContext, hpHz: number) {
  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.Q.value = 0.72;
  hp.frequency.value = hpHz;
  const low = offline.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 140;
  low.gain.value = hpHz > 200 ? -10 : 0;
  const mid = offline.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 900;
  mid.Q.value = 0.8;
  mid.gain.value = hpHz > 200 ? 1.5 : 0;
  const g = offline.createGain();
  g.gain.value = 1;
  hp.connect(low);
  low.connect(mid);
  mid.connect(g);
  return { hp, g };
}

export async function renderRemix(input: RenderInput): Promise<AudioBuffer> {
  const { sourceA, sourceB, plan } = input;
  const sr = sourceA.sampleRate;
  const job = plan.job;
  const target = snapClubBpm(plan.targetBpm, job);
  const bpmA = Math.max(70, input.bpmA || 120);
  const bpmB = Math.max(70, input.bpmB || bpmA);
  const rateA = clamp(target / bpmA, 0.8, 1.25);
  const rateB = clamp(target / bpmB, 0.8, 1.25);
  const barA = (60 / bpmA) * 4;
  const barB = (60 / bpmB) * 4;
  const barOut = (60 / target) * 4;
  const beat = 60 / target;
  const bars = 32;
  const outDur = bars * barOut;
  const offline = new OfflineAudioContext(2, Math.ceil(outDur * sr), sr);

  const master = offline.createGain();
  master.gain.value = 0.95;
  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = -13;
  comp.knee.value = 8;
  comp.ratio.value = 3.6;
  comp.attack.value = 0.004;
  comp.release.value = 0.14;
  master.connect(comp);
  comp.connect(offline.destination);

  const delay = offline.createDelay(1.2);
  delay.delayTime.value = beat * 0.75;
  const fb = offline.createGain();
  fb.gain.value = 0.34;
  const wet = offline.createGain();
  wet.gain.value = 0.18;
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  const drums = offline.createGain();
  drums.gain.value = job === "mashup" ? 0 : 0.86;
  drums.connect(master);

  const dropBar = job === "mashup" ? 16 : 8;
  const kicks = job === "mashup" ? [] : scheduleDrums(offline, drums, target, bars, dropBar);

  const phraseA = pickPhrase(sourceA, input.offsetA, barA, 8);
  const phraseB = sourceB ? pickPhrase(sourceB, input.offsetB, barB, 8) : 0;
  const hookA = pickPhrase(sourceA, input.offsetA, barA, 2);

  if (job === "mashup" && sourceB) {
    const aBus = bus(offline, 40);
    const bBus = bus(offline, 320);
    aBus.g.connect(master);
    aBus.g.connect(delay);
    bBus.g.connect(master);
    bBus.g.connect(delay);
    bBus.hp.frequency.setValueAtTime(340, 0);
    bBus.hp.frequency.setValueAtTime(340, 8 * barOut);
    bBus.hp.frequency.exponentialRampToValueAtTime(40, 16 * barOut);
    aBus.hp.frequency.setValueAtTime(40, 0);
    aBus.hp.frequency.setValueAtTime(40, 16 * barOut);
    aBus.hp.frequency.exponentialRampToValueAtTime(280, 17 * barOut);
    aBus.g.gain.setValueAtTime(0.82, 0);
    aBus.g.gain.setValueAtTime(0.82, 24 * barOut);
    aBus.g.gain.linearRampToValueAtTime(0, 28 * barOut);
    bBus.g.gain.setValueAtTime(0.2, 0);
    bBus.g.gain.setValueAtTime(0.2, 8 * barOut);
    bBus.g.gain.linearRampToValueAtTime(0.78, 16 * barOut);
    bBus.g.gain.setValueAtTime(0.84, 16 * barOut);
    for (let bar = 0; bar < 24; bar += 8) {
      playGrain(offline, sourceA, aBus.hp, bar * barOut, phraseA, barA * 8, rateA, 1);
    }
    for (let bar = 8; bar < 32; bar += 8) {
      playGrain(offline, sourceB, bBus.hp, bar * barOut, phraseB, barB * 8, rateB, 1);
    }
    wet.gain.setValueAtTime(0.12, 0);
    wet.gain.setValueAtTime(0.12, 24 * barOut);
    wet.gain.linearRampToValueAtTime(0.42, 28 * barOut);
  } else {
    const aBus = bus(offline, 320);
    aBus.hp.frequency.value = 320;
    aBus.g.connect(master);
    aBus.g.connect(delay);
    aBus.g.gain.value = 0.72;
    if (plan.pump && kicks.length) duckToKick(aBus.g, kicks, beat);

    for (let bar = 4; bar < 8; bar += 2) {
      playGrain(offline, sourceA, aBus.hp, bar * barOut, hookA, barA / 2, rateA, 0.55);
    }
    const sixA = barA / 16;
    const sixOut = barOut / 16;
    for (let i = 0; i < 8; i++) {
      playGrain(offline, sourceA, aBus.hp, 8 * barOut - barOut + i * sixOut, hookA, sixA, rateA, 0.85);
    }
    for (let bar = 8; bar < 24; bar += 8) {
      playGrain(offline, sourceA, aBus.hp, bar * barOut, phraseA, barA * 8, rateA, 0.8);
    }
    const rev = reverseSlice(offline, sourceA, hookA, barA / 2);
    playGrain(offline, rev, aBus.hp, 24 * barOut, 0, rev.duration, 1, 0.65);
    wet.gain.setValueAtTime(0.16, 24 * barOut);
    wet.gain.linearRampToValueAtTime(0.4, 26 * barOut);
    wet.gain.linearRampToValueAtTime(0.16, 28 * barOut);
    for (let bar = 28; bar < 32; bar += 4) {
      playGrain(offline, sourceA, aBus.hp, bar * barOut, hookA, barA * 4, rateA, 0.7);
    }

    if (sourceB && job === "both") {
      const bBus = bus(offline, 300);
      bBus.g.connect(master);
      bBus.g.connect(delay);
      bBus.g.gain.value = 0.68;
      if (plan.pump && kicks.length) duckToKick(bBus.g, kicks, beat);
      for (let bar = 16; bar < 32; bar += 8) {
        playGrain(offline, sourceB, bBus.hp, bar * barOut, phraseB, barB * 8, rateB, 0.78);
      }
    }
  }

  return offline.startRendering();
}
