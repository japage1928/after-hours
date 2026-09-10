import { chordAt, chordMidis, chordRootMidi, midiToFreq, scaleMidis } from "@/lib/chords";
import { genreById } from "@/lib/genres";
import { hash32 } from "@/lib/utils";
import type { Song, SongSection } from "@/lib/types";

export type Mix = { beat: number; vocals: number; bass: number };

type TickFn = (beats: number, durationBeats: number) => void;

function makeImpulse(ctx: AudioContext, seconds = 1.35): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
  }
  return buf;
}

function makeDrive(ctx: AudioContext, amount = 2.2): WaveShaperNode {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  const sh = ctx.createWaveShaper();
  sh.curve = curve;
  sh.oversample = "2x";
  return sh;
}

function envGain(
  ctx: AudioContext,
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

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private beatBus: GainNode | null = null;
  private bassBus: GainNode | null = null;
  private vocalBus: GainNode | null = null;
  private padBus: GainNode | null = null;
  private verb: ConvolverNode | null = null;
  private analyser: AnalyserNode | null = null;
  private drive: WaveShaperNode | null = null;

  private song: Song | null = null;
  private vocals = new Map<string, AudioBuffer>();
  private playing = false;
  private bpm = 94;
  private startBeats = 0;
  private originTime = 0;
  private pausedBeats = 0;
  private timer: number | null = null;
  private nextBeat16 = 0;
  private scheduledVocals = new Set<string>();
  private liveVocal: AudioBufferSourceNode | null = null;
  private mix: Mix = { beat: 0.78, vocals: 0.92, bass: 0.86 };
  private ticks = new Set<TickFn>();
  private raf = 0;
  private seed = 1;

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    await this.ensure();
    if (!this.ctx) throw new Error("Audio is not ready.");
    return this.ctx.decodeAudioData(data.slice(0));
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getSong(): Song | null {
    return this.song;
  }

  durationBeats(): number {
    if (!this.song) return 0;
    return this.song.sections.reduce((n, s) => n + s.bars * 4, 0);
  }

  currentBeats(): number {
    if (!this.playing || !this.ctx) return this.pausedBeats;
    const b = this.startBeats + ((this.ctx.currentTime - this.originTime) * this.bpm) / 60;
    return Math.max(0, b);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  onTick(fn: TickFn): () => void {
    this.ticks.add(fn);
    return () => this.ticks.delete(fn);
  }

  async ensure(): Promise<void> {
    if (typeof window === "undefined") return;
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.9;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4.5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.18;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;

    master.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(ctx.destination);

    const beatBus = ctx.createGain();
    const bassBus = ctx.createGain();
    const vocalBus = ctx.createGain();
    const padBus = ctx.createGain();
    beatBus.gain.value = this.mix.beat;
    bassBus.gain.value = this.mix.bass;
    vocalBus.gain.value = this.mix.vocals;
    padBus.gain.value = 0.55;

    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.22;
    verb.connect(verbGain);
    verbGain.connect(master);

    const drive = makeDrive(ctx, 2.4);

    beatBus.connect(master);
    padBus.connect(master);
    padBus.connect(verb);
    bassBus.connect(drive);
    drive.connect(master);
    vocalBus.connect(master);
    vocalBus.connect(verb);

    this.master = master;
    this.beatBus = beatBus;
    this.bassBus = bassBus;
    this.vocalBus = vocalBus;
    this.padBus = padBus;
    this.verb = verb;
    this.analyser = analyser;
    this.drive = drive;
    await ctx.resume();
  }

  setMix(mix: Partial<Mix>) {
    this.mix = { ...this.mix, ...mix };
    const t = this.ctx?.currentTime ?? 0;
    this.beatBus?.gain.setTargetAtTime(this.mix.beat, t, 0.04);
    this.bassBus?.gain.setTargetAtTime(this.mix.bass, t, 0.04);
    this.vocalBus?.gain.setTargetAtTime(this.mix.vocals, t, 0.04);
  }

  load(song: Song) {
    this.stop();
    this.song = song;
    this.bpm = song.bpm;
    this.pausedBeats = 0;
    this.startBeats = 0;
    this.nextBeat16 = 0;
    this.vocals.clear();
    this.scheduledVocals.clear();
    this.seed = hash32(song.id + song.title) || 1;
    this.emit();
  }

  attachVocal(sectionId: string, buffer: AudioBuffer) {
    this.vocals.set(sectionId, buffer);
    if (!this.playing || !this.ctx || !this.song) return;
    const start = this.sectionStartBeats(sectionId);
    if (start == null) return;
    const now = this.currentBeats();
    const section = this.song.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const dur = section.bars * 4;
    if (now >= start + dur) return;
    if (now < start - 0.05) {
      this.scheduleVocal(sectionId, start);
    } else {
      const offset = ((now - start) * 60) / this.bpm;
      this.playVocal(sectionId, 0, offset);
    }
  }

  async play() {
    await this.ensure();
    if (!this.ctx || !this.song) return;
    if (this.playing) return;
    if (this.pausedBeats >= this.durationBeats() - 0.25) this.pausedBeats = 0;
    this.playing = true;
    this.originTime = this.ctx.currentTime;
    this.startBeats = this.pausedBeats;
    this.nextBeat16 = Math.floor(this.pausedBeats * 4) / 4;
    this.scheduledVocals.clear();
    this.scheduleLoop();
    this.pump();
  }

  pause() {
    if (!this.playing) return;
    this.pausedBeats = this.currentBeats();
    this.playing = false;
    this.clearTimer();
    this.stopLiveVocal();
    this.emit();
  }

  stop() {
    this.playing = false;
    this.pausedBeats = 0;
    this.startBeats = 0;
    this.nextBeat16 = 0;
    this.clearTimer();
    this.stopLiveVocal();
    this.scheduledVocals.clear();
    this.emit();
  }

  seek(beats: number) {
    const dur = this.durationBeats();
    const next = Math.max(0, Math.min(dur, beats));
    const was = this.playing;
    this.pause();
    this.pausedBeats = next;
    this.emit();
    if (was) void this.play();
  }

  beatsToSeconds(beats: number): number {
    return (beats * 60) / this.bpm;
  }

  private emit() {
    const b = this.currentBeats();
    const d = this.durationBeats();
    this.ticks.forEach((fn) => fn(b, d));
  }

  private pump = () => {
    this.emit();
    if (!this.playing) return;
    if (this.currentBeats() >= this.durationBeats()) {
      this.pause();
      this.pausedBeats = 0;
      this.emit();
      return;
    }
    this.raf = requestAnimationFrame(this.pump);
  };

  private clearTimer() {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private stopLiveVocal() {
    try {
      this.liveVocal?.stop();
    } catch {
      /* already stopped */
    }
    this.liveVocal = null;
  }

  private scheduleLoop() {
    this.clearTimer();
    this.scheduler();
    this.timer = window.setInterval(() => this.scheduler(), 40);
    this.raf = requestAnimationFrame(this.pump);
  }

  private scheduler() {
    if (!this.ctx || !this.playing || !this.song) return;
    const aheadBeats = (0.22 * this.bpm) / 60;
    const nowBeats = this.currentBeats();
    while (this.nextBeat16 < nowBeats + aheadBeats) {
      this.scheduleSlice(this.nextBeat16);
      this.nextBeat16 += 0.25;
    }
  }

  private locate(beats: number): { section: SongSection; local: number; bar: number } | null {
    if (!this.song) return null;
    let acc = 0;
    for (const section of this.song.sections) {
      const len = section.bars * 4;
      if (beats < acc + len) {
        const local = beats - acc;
        return { section, local, bar: Math.floor(local / 4) };
      }
      acc += len;
    }
    return null;
  }

  private sectionStartBeats(id: string): number | null {
    if (!this.song) return null;
    let acc = 0;
    for (const s of this.song.sections) {
      if (s.id === id) return acc;
      acc += s.bars * 4;
    }
    return null;
  }

  private when(beats: number): number {
    if (!this.ctx) return 0;
    const rel = beats - this.startBeats;
    return this.originTime + (rel * 60) / this.bpm;
  }

  private swing(beats: number): number {
    if (!this.song) return beats;
    const swing = genreById(this.song.genre).swing;
    const sixteenths = beats * 4;
    const isOff = Math.round(sixteenths) % 2 === 1;
    if (!isOff) return beats;
    return beats + swing * 0.12;
  }

  private scheduleSlice(beats: number) {
    const loc = this.locate(beats);
    if (!loc || !this.ctx) return;
    const t = this.when(this.swing(beats));
    const { section, local, bar } = loc;
    const step = Math.round(local * 4) % 16;
    const chord = chordAt(section.chords, bar);
    const genre = this.song?.genre ?? "pop";
    const energy = section.kind === "chorus" ? 1 : section.kind === "intro" ? 0.55 : 0.78;

    this.hitDrums(genre, step, t, energy);
    if (step % 4 === 0) this.hitBass(chord, t, energy, genre);
    if (step === 0) this.hitChord(chord, t, energy, genre, section.kind);
    if (step % 2 === 0) this.hitMelody(beats, t, energy, section);
    if (local < 0.05) this.scheduleVocal(section.id, beats - local);

    if (section.kind !== "intro" && !this.vocals.has(section.id) && step % 2 === 0) {
      this.hitSynthVox(beats, t, chord, energy);
    }
  }

  private hitDrums(genre: string, step: number, t: number, energy: number) {
    const kickOn = (s: number) => this.kick(t, 0.9 * energy);
    const snareOn = () => this.snare(t, 0.72 * energy);
    const hatOn = (vel: number) => this.hat(t, vel * energy, genre === "trap" || genre === "drill");

    if (genre === "house") {
      if (step % 4 === 0) kickOn(step);
      if (step === 4 || step === 12) this.clap(t, 0.7 * energy);
      if (step % 4 === 2) hatOn(0.45);
      return;
    }
    if (genre === "latin") {
      if (step === 0 || step === 8) kickOn(step);
      if (step === 6 || step === 12) snareOn();
      if (step % 2 === 0) hatOn(step % 4 === 0 ? 0.4 : 0.22);
      return;
    }
    if (genre === "afrobeats") {
      if (step === 0 || step === 6 || step === 10) kickOn(step);
      if (step === 4 || step === 12) snareOn();
      hatOn(step % 2 === 0 ? 0.38 : 0.18);
      return;
    }
    if (genre === "rock" || genre === "punk" || genre === "metal") {
      if (genre === "metal") {
        if (step % 2 === 0) kickOn(step);
      } else if (step === 0 || step === 8) kickOn(step);
      if (step === 4 || step === 12) snareOn();
      hatOn(0.28);
      return;
    }
    if (genre === "trap" || genre === "drill") {
      if (step === 0 || step === 8 || (genre === "drill" && step === 10)) kickOn(step);
      if (step === 4 || step === 12) this.clap(t, 0.78 * energy);
      hatOn(step % 2 === 0 ? 0.42 : 0.16);
      if (step === 14 || step === 15) this.hat(t, 0.55 * energy, true);
      return;
    }
    if (step === 0 || step === 8) kickOn(step);
    if (step === 4 || step === 12) snareOn();
    if (step % 2 === 0) hatOn(0.32);
  }

  private kick(t: number, vel: number) {
    const ctx = this.ctx;
    const dest = this.beatBus;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(148, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = envGain(ctx, t, vel, 0.004, 0.28);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.32);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf(0.04);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const ng = envGain(ctx, t, vel * 0.18, 0.001, 0.03);
    noise.connect(hp);
    hp.connect(ng);
    ng.connect(dest);
    noise.start(t);
    noise.stop(t + 0.05);

    if (this.padBus) {
      this.padBus.gain.setTargetAtTime(0.22, t, 0.01);
      this.padBus.gain.setTargetAtTime(0.55, t + 0.14, 0.08);
    }
  }

  private snare(t: number, vel: number) {
    const ctx = this.ctx;
    const dest = this.beatBus;
    if (!ctx || !dest) return;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf(0.22);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.9;
    const ng = envGain(ctx, t, vel, 0.002, 0.16);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    noise.start(t);
    noise.stop(t + 0.22);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 180;
    const og = envGain(ctx, t, vel * 0.35, 0.002, 0.08);
    osc.connect(og);
    og.connect(dest);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  private clap(t: number, vel: number) {
    const ctx = this.ctx;
    const dest = this.beatBus;
    if (!ctx || !dest) return;
    for (let i = 0; i < 3; i++) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuf(0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2200;
      const g = envGain(ctx, t + i * 0.012, vel * (0.7 - i * 0.18), 0.001, 0.09);
      noise.connect(bp);
      bp.connect(g);
      g.connect(dest);
      noise.start(t + i * 0.012);
      noise.stop(t + 0.14);
    }
  }

  private hat(t: number, vel: number, open: boolean) {
    const ctx = this.ctx;
    const dest = this.beatBus;
    if (!ctx || !dest) return;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf(open ? 0.18 : 0.06);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = envGain(ctx, t, vel * 0.55, 0.001, open ? 0.12 : 0.04);
    noise.connect(hp);
    hp.connect(g);
    g.connect(dest);
    noise.start(t);
    noise.stop(t + (open ? 0.16 : 0.05));
  }

  private hitBass(chord: string, t: number, energy: number, genre: string) {
    const ctx = this.ctx;
    const dest = this.bassBus;
    if (!ctx || !dest) return;
    const midi = chordRootMidi(chord, genre === "trap" || genre === "drill" ? 1 : 2);
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * 1.08, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    const decay = genre === "trap" || genre === "drill" ? 0.9 : 0.38;
    const g = envGain(ctx, t, 0.85 * energy, 0.006, decay);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  private hitChord(
    chord: string,
    t: number,
    energy: number,
    genre: string,
    kind: SongSection["kind"],
  ) {
    const ctx = this.ctx;
    const dest = this.padBus;
    if (!ctx || !dest) return;
    const midis = chordMidis(chord, 3);
    const rock = genre === "rock" || genre === "punk" || genre === "metal";
    const decay = kind === "chorus" ? 1.4 : rock ? 0.45 : 1.1;
    for (const midi of midis) {
      const osc = ctx.createOscillator();
      osc.type = rock ? "sawtooth" : "triangle";
      osc.frequency.value = midiToFreq(midi);
      const g = envGain(ctx, t, (rock ? 0.12 : 0.09) * energy, 0.02, decay);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = rock ? 1400 : 900;
      osc.connect(lp);
      lp.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  }

  private hitMelody(beats: number, t: number, energy: number, section: SongSection) {
    if (section.kind === "intro") return;
    const ctx = this.ctx;
    const dest = this.padBus;
    if (!ctx || !dest || !this.song) return;
    const scale = scaleMidis(this.song.key, 5);
    const idx = (Math.floor(beats * 2) * 3 + (this.seed % 7)) % scale.length;
    const midi = scale[idx] ?? 72;
    if ((Math.floor(beats * 4) + this.seed) % 5 === 0) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToFreq(midi);
    const g = envGain(ctx, t, 0.07 * energy, 0.01, 0.22);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  private hitSynthVox(beats: number, t: number, chord: string, energy: number) {
    const ctx = this.ctx;
    const dest = this.vocalBus;
    if (!ctx || !dest) return;
    const midi = chordRootMidi(chord, 4);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = midiToFreq(midi + 12);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const g = envGain(ctx, t, 0.045 * energy, 0.02, 0.28);
    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private scheduleVocal(sectionId: string, startBeats: number) {
    if (this.scheduledVocals.has(sectionId)) return;
    const buf = this.vocals.get(sectionId);
    if (!buf) return;
    this.scheduledVocals.add(sectionId);
    const delay = this.when(startBeats) - (this.ctx?.currentTime ?? 0);
    this.playVocal(sectionId, Math.max(0, delay), 0);
  }

  private playVocal(sectionId: string, delay: number, offset: number) {
    const ctx = this.ctx;
    const dest = this.vocalBus;
    const buf = this.vocals.get(sectionId);
    const section = this.song?.sections.find((s) => s.id === sectionId);
    if (!ctx || !dest || !buf || !section) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const sectionSec = (section.bars * 4 * 60) / this.bpm;
    const remain = Math.max(0.05, buf.duration - offset);
    const rate = Math.min(1.22, Math.max(0.85, remain / Math.max(0.2, sectionSec - offset)));
    src.playbackRate.value = rate;
    src.connect(dest);
    const when = ctx.currentTime + delay;
    try {
      src.start(when, offset);
      this.liveVocal = src;
    } catch {
      /* ignore */
    }
  }

  private _noise: AudioBuffer | null = null;
  private noiseBuf(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    if (!this._noise) {
      const len = ctx.sampleRate * 1;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const slice = ctx.createBuffer(1, n, ctx.sampleRate);
    slice.getChannelData(0).set(this._noise.getChannelData(0).subarray(0, n));
    return slice;
  }
}

export const engine = new AudioEngine();
