function envGain(
  ctx: BaseAudioContext,
  t: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function cap(t: number, duration: number, life: number): number {
  return Math.min(duration - 0.003, t + life);
}

function kick(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number, duration: number) {
  if (t >= duration - 0.02) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(46, t + 0.12);
  const g = envGain(ctx, t, vel, 0.004, 0.28);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(cap(t, duration, 0.32));
}

function clap(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  vel: number,
  noise: AudioBuffer,
  duration: number,
) {
  if (t >= duration - 0.02) return;
  for (let i = 0; i < 3; i++) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2100;
    const g = envGain(ctx, t + i * 0.012, vel * (0.72 - i * 0.18), 0.001, 0.1);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start(t + i * 0.012);
    src.stop(cap(t + i * 0.012, duration, 0.14));
  }
}

function hat(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  vel: number,
  open: boolean,
  noise: AudioBuffer,
  duration: number,
) {
  if (t >= duration - 0.02) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7200;
  const g = envGain(ctx, t, vel, 0.001, open ? 0.12 : 0.035);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(cap(t, duration, open ? 0.13 : 0.045));
}

function bass(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  freq: number,
  vel: number,
  decay: number,
  duration: number,
) {
  if (t >= duration - 0.02) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.06, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  const g = envGain(ctx, t, vel, 0.006, decay);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(cap(t, duration, decay + 0.03));
}

function stab(ctx: BaseAudioContext, dest: AudioNode, t: number, freqs: number[], vel: number, duration: number) {
  if (t >= duration - 0.02) return;
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const g = envGain(ctx, t, vel, 0.01, 0.42);
    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(cap(t, duration, 0.48));
  }
}

async function renderLoop(
  bpm: number,
  bars: number,
  schedule: (ctx: OfflineAudioContext, dest: GainNode, stepSec: number, duration: number) => void,
): Promise<AudioBuffer> {
  const sr = 44100;
  const duration = (bars * 4 * 60) / bpm;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * duration), sr);
  const dest = ctx.createGain();
  dest.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  dest.connect(comp);
  comp.connect(ctx.destination);
  schedule(ctx, dest, 60 / bpm / 4, duration);
  return ctx.startRendering();
}

export async function makeHouseLoop(): Promise<AudioBuffer> {
  const bpm = 124;
  const bars = 8;
  return renderLoop(bpm, bars, (ctx, dest, step, duration) => {
    const noise = noiseBuffer(ctx, 0.22);
    const chords = [
      [220, 261.63, 329.63],
      [196, 246.94, 293.66],
      [174.61, 220, 261.63],
      [196, 246.94, 311.13],
    ];
    for (let s = 0; s < bars * 16; s++) {
      const t = s * step;
      const bar = Math.floor(s / 16);
      if (s % 4 === 0) kick(ctx, dest, t, 0.92, duration);
      if (s % 8 === 4) clap(ctx, dest, t, 0.7, noise, duration);
      hat(ctx, dest, t, s % 2 === 0 ? 0.28 : 0.14, s % 8 === 6, noise, duration);
      if (s % 4 === 0) {
        const root = [55, 49, 43.65, 49][bar % 4] ?? 55;
        bass(ctx, dest, t, root, 0.72, 0.36, duration);
      }
      if (s % 16 === 0) stab(ctx, dest, t, chords[bar % 4] ?? chords[0]!, 0.1, duration);
    }
  });
}

export async function makeTrapLoop(): Promise<AudioBuffer> {
  const bpm = 140;
  const bars = 8;
  return renderLoop(bpm, bars, (ctx, dest, step, duration) => {
    const noise = noiseBuffer(ctx, 0.2);
    for (let s = 0; s < bars * 16; s++) {
      const t = s * step;
      const bar = Math.floor(s / 16);
      if (s % 16 === 0 || s % 16 === 8 || s % 16 === 11) kick(ctx, dest, t, 0.95, duration);
      if (s % 8 === 4) clap(ctx, dest, t, 0.78, noise, duration);
      hat(ctx, dest, t, s % 2 === 0 ? 0.34 : 0.12, s % 16 === 14, noise, duration);
      if (s % 16 === 14 || s % 16 === 15) hat(ctx, dest, t, 0.42, false, noise, duration);
      if (s % 8 === 0) {
        const root = bar % 4 < 2 ? 41.2 : 36.71;
        bass(ctx, dest, t, root, 0.88, 0.85, duration);
      }
    }
  });
}
