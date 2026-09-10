import { SimpleFilter, SoundTouch } from "soundtouchjs";

/** Change tempo independently of pitch. Yield regularly so Stop remains responsive. */
export async function stretchAudio(buffer: AudioBuffer, tempo: number, semitones = 0, signal?: AbortSignal): Promise<AudioBuffer> {
  signal?.throwIfAborted();
  if (!Number.isFinite(tempo) || tempo < 0.5 || tempo > 2) throw new Error("Choose tempos within half to double the original BPM.");
  if (Math.abs(tempo - 1) < 0.0001 && semitones === 0) return buffer;
  const pipe = new SoundTouch();
  pipe.tempo = tempo;
  pipe.pitchSemitones = semitones;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1));
  // Zero padding flushes SoundTouch's internal analysis window at EOF.
  const padding = 32768;
  const filter = new SimpleFilter({ extract(target, frames, position) {
    const count = Math.max(0, Math.min(frames, buffer.length + padding - position));
    for (let i = 0; i < count; i++) {
      target[i * 2] = left[position + i] ?? 0;
      target[i * 2 + 1] = right[position + i] ?? 0;
    }
    return count;
  } }, pipe);
  const length = Math.max(1, Math.round(buffer.length / tempo));
  const output = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: buffer.sampleRate });
  const a = output.getChannelData(0), b = output.getChannelData(1);
  const chunk = new Float32Array(8192);
  for (let position = 0; position < length;) {
    signal?.throwIfAborted();
    const count = filter.extract(chunk, Math.min(4096, length - position));
    if (!count) throw new Error("Audio stretching stopped before the track was complete.");
    for (let i = 0; i < count; i++) { a[position + i] = chunk[i * 2]; b[position + i] = chunk[i * 2 + 1]; }
    position += count;
    if (position % 32768 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return output;
}
