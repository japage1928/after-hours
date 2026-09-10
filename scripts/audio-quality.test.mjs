import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '../src/lib/audio-export.ts';
import { stretchAudio } from '../src/lib/time-stretch.ts';

// AudioBuffer data interface for testing DSP independently from device playback.
class TestBuffer {
  constructor({ numberOfChannels, length, sampleRate }) {
    Object.assign(this, { numberOfChannels, length, sampleRate, duration: length / sampleRate });
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(c) { return this.channels[c]; }
}
globalThis.AudioBuffer = TestBuffer;
function tone(seconds = 2, hz = 440) {
  const b = new TestBuffer({ numberOfChannels: 1, sampleRate: 44100, length: seconds * 44100 });
  const data = b.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = 0.5 * Math.sin(2 * Math.PI * hz * i / 44100);
  return b;
}
function frequency(buffer) {
  const d = buffer.getChannelData(0), a = Math.round(buffer.sampleRate * 0.3), b = Math.round(buffer.sampleRate * 0.9);
  let crossings = 0;
  for (let i = a; i < b; i++) if (d[i] <= 0 && d[i + 1] > 0) crossings++;
  return crossings * buffer.sampleRate / (b - a);
}
test('tempo changes duration without changing a 440 Hz pitch', async () => {
  for (const tempo of [0.8, 1.25]) {
    const result = await stretchAudio(tone(), tempo);
    assert.ok(Math.abs(result.duration - 2 / tempo) < 0.0001);
    assert.ok(Math.abs(frequency(result) - 440) < 5);
    assert.ok(result.channels.every(c => c.every(Number.isFinite)));
  }
});
test('pitch can change independently of tempo', async () => {
  const result = await stretchAudio(tone(), 1, 12);
  assert.equal(result.duration, 2);
  assert.ok(Math.abs(frequency(result) - 880) < 5);
});
test('cancelled stretching stops before returning audio', async () => {
  const controller = new AbortController();
  const pending = stretchAudio(tone(10), 0.8, 0, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
test('WAV is valid stereo interleaved PCM and clamps invalid samples', () => {
  const b = new TestBuffer({ numberOfChannels: 2, length: 2, sampleRate: 44100 });
  b.channels[0].set([1, -1]); b.channels[1].set([NaN, 2]);
  const bytes = encodeWav(b), view = new DataView(bytes);
  assert.equal(bytes.byteLength, 52);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint32(4, true), 44);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), 0);
  assert.equal(view.getInt16(48, true), -32768);
  assert.equal(view.getInt16(50, true), 32767);
});
