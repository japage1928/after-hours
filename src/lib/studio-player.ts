import { waveformPeaks } from "@/lib/bpm";

/**
 * One-buffer player for generated / bounced results.
 * Not a two-deck DJ — play, pause, stop, download-ready AudioBuffer.
 */

type TickFn = (t: { current: number; duration: number; playing: boolean }) => void;

export class StudioPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private playing = false;
  private startOffset = 0;
  private originTime = 0;
  private ticks = new Set<TickFn>();
  private raf = 0;

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  duration(): number {
    return this.buffer?.duration ?? 0;
  }

  hasBuffer(): boolean {
    return Boolean(this.buffer);
  }

  currentTime(): number {
    if (!this.ctx || !this.playing || !this.buffer) return this.startOffset;
    const elapsed = this.ctx.currentTime - this.originTime;
    if (elapsed < 0) return this.startOffset;
    return Math.min(this.buffer.duration, this.startOffset + elapsed);
  }

  peaks(): number[] {
    return this.buffer ? waveformPeaks(this.buffer) : Array.from({ length: 80 }, () => 0.12);
  }

  sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  onTick(fn: TickFn): () => void {
    this.ticks.add(fn);
    return () => this.ticks.delete(fn);
  }

  async ensure(): Promise<void> {
    if (typeof window === "undefined") return;
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        await Promise.race([
          this.ctx.resume(),
          new Promise<void>((resolve) => window.setTimeout(resolve, 400)),
        ]);
      }
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.94;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    this.master = master;
    this.analyser = analyser;
    if (ctx.state === "suspended") {
      await Promise.race([
        ctx.resume(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 400)),
      ]);
    }
  }

  async decodeFile(file: File): Promise<AudioBuffer> {
    await this.ensure();
    if (!this.ctx) throw new Error("Audio is not ready.");
    const data = await file.arrayBuffer();
    try {
      return await this.ctx.decodeAudioData(data.slice(0));
    } catch {
      throw new Error(
        "Couldn’t decode that audio. Try an M4A or MP3 under 40 MB.",
      );
    }
  }

  async decodeBytes(bytes: ArrayBuffer): Promise<AudioBuffer> {
    await this.ensure();
    if (!this.ctx) throw new Error("Audio is not ready.");
    return this.ctx.decodeAudioData(bytes.slice(0));
  }

  load(buffer: AudioBuffer) {
    this.stop();
    this.buffer = buffer;
    this.startOffset = 0;
    this.emit();
  }

  clear() {
    this.stop();
    this.buffer = null;
    this.startOffset = 0;
    this.emit();
  }

  async play(offset?: number) {
    await this.ensure();
    if (!this.ctx || !this.master || !this.buffer) return;
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.master);
    const off = Math.max(
      0,
      Math.min(this.buffer.duration - 0.05, offset ?? this.startOffset),
    );
    const startAt = this.ctx.currentTime;
    try {
      src.start(startAt, off);
    } catch (err) {
      console.error("[studio] play failed", err);
      return;
    }
    src.onended = () => {
      if (this.source === src) {
        this.playing = false;
        this.startOffset = this.buffer?.duration ?? 0;
        this.source = null;
        this.emit();
      }
    };
    this.source = src;
    this.playing = true;
    this.startOffset = off;
    this.originTime = startAt;
    this.emit();
    this.pump();
  }

  pause() {
    if (this.playing) this.startOffset = this.currentTime();
    this.stopSource();
    this.playing = false;
    this.emit();
  }

  stop() {
    this.stopSource();
    this.playing = false;
    this.startOffset = 0;
    this.emit();
  }

  private stopSource() {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        /* already stopped */
      }
      try {
        this.source.disconnect();
      } catch {
        /* ignore */
      }
      this.source = null;
    }
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private pump() {
    if (this.raf) return;
    const tick = () => {
      this.emit();
      if (this.playing) this.raf = requestAnimationFrame(tick);
      else this.raf = 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  private emit() {
    const payload = {
      current: this.currentTime(),
      duration: this.duration(),
      playing: this.playing,
    };
    for (const fn of this.ticks) fn(payload);
  }
}

export const studioPlayer = new StudioPlayer();
