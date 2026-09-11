/**
 * Bounce two AudioBuffers into one listening mix.
 * Remix/mashup output is a rendered file — not a live DJ crossfade.
 */

export const MAX_BOUNCE_SEC = 180;
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

export type MixRecipe = {
  /** Playback rate applied to the overlay (vocals / original song). */
  overlayRate: number;
  /** Playback rate applied to the bed (beats / generated instrumental). */
  bedRate: number;
  overlayHighpassHz: number;
  bedLowpassHz: number | null;
  overlayGain: number;
  bedGain: number;
  /** Seconds of bed before overlay enters. */
  overlayDelaySec: number;
};

export function playbackRateToMatchBpm(fromBpm: number, toBpm: number): number {
  const from = Math.max(60, Math.min(200, fromBpm || toBpm || 120));
  const to = Math.max(60, Math.min(200, toBpm || from));
  const rate = to / from;
  return Math.max(0.7, Math.min(1.4, rate));
}

export function barsToSeconds(bpm: number, bars: number): number {
  const beat = 60 / Math.max(60, bpm || 120);
  return bars * 4 * beat;
}

export function clampBounceDuration(seconds: number): number {
  return Math.min(MAX_BOUNCE_SEC, Math.max(8, seconds));
}

/** Remix: original song (overlay) over a generated/local genre bed. */
export function remixMixRecipe(opts: {
  originalBpm: number;
  bedBpm: number;
}): MixRecipe {
  const overlayRate = playbackRateToMatchBpm(opts.originalBpm, opts.bedBpm);
  return {
    overlayRate,
    bedRate: 1,
    overlayHighpassHz: 180,
    bedLowpassHz: null,
    overlayGain: 0.72,
    bedGain: 0.88,
    overlayDelaySec: 0,
  };
}

/** Mashup: beats (bed) × lyrics/vocals (overlay), 2-bar intro then lock. */
export function mashupMixRecipe(opts: {
  beatsBpm: number;
  lyricsBpm: number;
}): MixRecipe {
  const overlayRate = playbackRateToMatchBpm(opts.lyricsBpm, opts.beatsBpm);
  return {
    overlayRate,
    bedRate: 1,
    overlayHighpassHz: 220,
    bedLowpassHz: 9000,
    overlayGain: 0.78,
    bedGain: 0.9,
    overlayDelaySec: barsToSeconds(opts.beatsBpm, 2),
  };
}

export function bounceOutputDuration(opts: {
  bedDurationSec: number;
  overlayDurationSec: number;
  recipe: MixRecipe;
}): number {
  const bed = opts.bedDurationSec / Math.max(0.01, opts.recipe.bedRate);
  const overlay =
    opts.recipe.overlayDelaySec +
    opts.overlayDurationSec / Math.max(0.01, opts.recipe.overlayRate);
  return clampBounceDuration(Math.max(bed, overlay));
}

function connectFilterChain(
  ctx: OfflineAudioContext,
  src: AudioBufferSourceNode,
  dest: AudioNode,
  opts: { highpassHz?: number; lowpassHz?: number | null; gain: number },
) {
  const gain = ctx.createGain();
  gain.gain.value = opts.gain;
  let node: AudioNode = src;
  if (opts.highpassHz && opts.highpassHz > 20) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = opts.highpassHz;
    hp.Q.value = 0.7;
    node.connect(hp);
    node = hp;
  }
  if (opts.lowpassHz && opts.lowpassHz < 18000) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = opts.lowpassHz;
    lp.Q.value = 0.7;
    node.connect(lp);
    node = lp;
  }
  node.connect(gain);
  gain.connect(dest);
}

/**
 * Render bed + overlay into one buffer. Bed loops if shorter than the mix.
 */
export async function bounceMix(opts: {
  bed: AudioBuffer;
  overlay: AudioBuffer;
  recipe: MixRecipe;
  sampleRate?: number;
}): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? opts.bed.sampleRate ?? 44100;
  const duration = bounceOutputDuration({
    bedDurationSec: opts.bed.duration,
    overlayDurationSec: opts.overlay.duration,
    recipe: opts.recipe,
  });
  const length = Math.max(1, Math.ceil(duration * sr));
  const ctx = new OfflineAudioContext(2, length, sr);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 2.8;
  comp.attack.value = 0.01;
  comp.release.value = 0.18;
  const master = ctx.createGain();
  master.gain.value = 0.95;
  comp.connect(master);
  master.connect(ctx.destination);

  const bedSrc = ctx.createBufferSource();
  bedSrc.buffer = opts.bed;
  bedSrc.playbackRate.value = opts.recipe.bedRate;
  const bedPlayed = opts.bed.duration / Math.max(0.01, opts.recipe.bedRate);
  bedSrc.loop = bedPlayed < duration - 0.4;
  connectFilterChain(ctx, bedSrc, comp, {
    lowpassHz: opts.recipe.bedLowpassHz,
    gain: opts.recipe.bedGain,
  });

  const overSrc = ctx.createBufferSource();
  overSrc.buffer = opts.overlay;
  overSrc.playbackRate.value = opts.recipe.overlayRate;
  connectFilterChain(ctx, overSrc, comp, {
    highpassHz: opts.recipe.overlayHighpassHz,
    gain: opts.recipe.overlayGain,
  });

  bedSrc.start(0);
  overSrc.start(Math.min(duration - 0.05, Math.max(0, opts.recipe.overlayDelaySec)));

  return ctx.startRendering();
}

export function floatTo16BitPcm(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

export function wavBytesFromPcm(
  pcm: Int16Array,
  channels: number,
  sampleRate: number,
): Uint8Array {
  const dataSize = pcm.byteLength;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
  return out;
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const length = buffer.length;
  const interleaved = new Float32Array(length * channels);
  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    chans.push(buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)));
  }
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      interleaved[i * channels + c] = chans[c]![i] ?? 0;
    }
  }
  const bytes = wavBytesFromPcm(
    floatTo16BitPcm(interleaved),
    channels,
    buffer.sampleRate,
  );
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: "audio/wav" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export function downloadWav(buffer: AudioBuffer, filename: string) {
  downloadBlob(encodeWav(buffer), filename.endsWith(".wav") ? filename : `${filename}.wav`);
}

/** Download ACE-Step mp3 when we still have the original payload. */
export function downloadAceStepMp3(base64: string, mime: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "mp3";
  downloadBlob(new Blob([bytes], { type: mime || "audio/mpeg" }), `${filename}.${ext}`);
}
