/** Interleaved, little-endian 16-bit PCM WAV. */
export function encodeWav(buffer: Pick<AudioBuffer, "numberOfChannels" | "length" | "sampleRate" | "getChannelData">): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const size = buffer.length * channels * 2;
  const bytes = new ArrayBuffer(44 + size);
  const view = new DataView(bytes);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  ascii(0, "RIFF"); view.setUint32(4, 36 + size, true); ascii(8, "WAVE");
  ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, size, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const raw = data[c][i];
    const value = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
    view.setInt16(44 + (i * channels + c) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
