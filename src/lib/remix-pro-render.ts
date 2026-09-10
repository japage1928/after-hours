import { stretchAudio } from "./time-stretch.ts";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function nearestBar(sec: number, bar: number, duration: number, barsNeeded: number) {
  const q = Math.round(sec / bar) * bar;
  return clamp(q, 0, Math.max(0, duration - bar * barsNeeded));
}

export async function renderProfessionalRemix(input: {
  source: AudioBuffer;
  bpm: number;
  offset: number;
  requestedBpm?: number;
  signal?: AbortSignal;
}): Promise<AudioBuffer> {
  const sourceBpm = clamp(input.bpm || 120, 72, 178);

  // A DJ does not turn an 88 BPM song into 126 BPM just because a club preset exists.
  // Respect the detected/original groove and allow only a subtle tempo move.
  const requested = Number.isFinite(input.requestedBpm) ? input.requestedBpm! : sourceBpm;
  const maxDelta = sourceBpm * 0.04;
  const targetBpm = clamp(requested, sourceBpm - maxDelta, sourceBpm + maxDelta);
  const tempo = targetBpm / sourceBpm;
  const stretched = await stretchAudio(input.source, tempo, 0, input.signal);
  input.signal?.throwIfAborted();

  const bar = (60 / targetBpm) * 4;
  const cue = nearestBar(input.offset / tempo, bar, stretched.duration, 8);
  const availableBars = Math.floor((stretched.duration - cue) / bar);
  if (availableBars < 8) throw new Error("Choose a cue point with at least 8 bars remaining.");

  const bars = Math.min(32, availableBars);
  const outDur = bars * bar;
  const sr = stretched.sampleRate;
  const offline = new OfflineAudioContext(2, Math.ceil(outDur * sr), sr);

  const source = offline.createBufferSource();
  source.buffer = stretched;

  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.Q.value = 0.7;
  hp.frequency.setValueAtTime(150, 0);
  hp.frequency.exponentialRampToValueAtTime(35, Math.min(outDur, 4 * bar));

  const low = offline.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 130;
  low.gain.value = 0;

  const gain = offline.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.72, 0.06);
  gain.gain.linearRampToValueAtTime(0.92, Math.min(outDur, 4 * bar));

  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.knee.value = 12;
  comp.ratio.value = 2.2;
  comp.attack.value = 0.012;
  comp.release.value = 0.22;

  source.connect(hp);
  hp.connect(low);
  low.connect(gain);
  gain.connect(comp);
  comp.connect(offline.destination);

  // One restrained phrase transition. No 1/16-note chopping, no reverse hits,
  // no synthetic drum pileup over an already-mastered song.
  if (bars >= 24) {
    const transitionStart = 16 * bar;
    const transitionEnd = 20 * bar;
    hp.frequency.setValueAtTime(35, transitionStart);
    hp.frequency.exponentialRampToValueAtTime(125, transitionStart + 2 * bar);
    hp.frequency.exponentialRampToValueAtTime(35, transitionEnd);
    gain.gain.setValueAtTime(0.92, transitionStart);
    gain.gain.linearRampToValueAtTime(0.78, transitionStart + 2 * bar);
    gain.gain.linearRampToValueAtTime(0.94, transitionEnd);
  }

  const outroStart = Math.max(0, outDur - 2 * bar);
  gain.gain.setValueAtTime(0.94, outroStart);
  gain.gain.linearRampToValueAtTime(0, outDur);

  source.start(0, cue, outDur);
  const rendered = await offline.startRendering();
  input.signal?.throwIfAborted();

  let peak = 0;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const data = rendered.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const sample = data[i];
      if (!Number.isFinite(sample)) throw new Error("The remix contains invalid audio.");
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  if (peak < 0.00001) throw new Error("The remix rendered silent audio.");
  if (peak > 0.98) {
    const scale = 0.98 / peak;
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      const data = rendered.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
  }

  return rendered;
}
