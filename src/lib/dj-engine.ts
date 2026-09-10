import { detectBpm, waveformPeaks, type BpmGuess } from "./bpm.ts";
import type { MixPlan } from "@/lib/dj-api";
import { renderRemix } from "./remix-render.ts";

export type DeckId = "a" | "b";

export type DeckInfo = {
  id: DeckId;
  name: string;
  bpm: number;
  duration: number;
  offset: number;
  peaks: number[];
  looping: boolean;
  hasTrack: boolean;
};

type DeckNodes = {
  buffer: AudioBuffer | null;
  info: DeckInfo;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  low: BiquadFilterNode | null;
  mid: BiquadFilterNode | null;
  high: BiquadFilterNode | null;
  hp: BiquadFilterNode | null;
  playing: boolean;
  originTime: number;
  startOffset: number;
  rate: number;
  volume: number;
  eq: { low: number; mid: number; high: number };
  filter: number;
};

function emptyInfo(id: DeckId, name: string): DeckInfo {
  return {
    id,
    name,
    bpm: 120,
    duration: 0,
    offset: 0,
    peaks: Array.from({ length: 80 }, () => 0.12),
    looping: false,
    hasTrack: false,
  };
}

type TickFn = (times: {
  a: number;
  b: number;
  xfader: number;
  playing: boolean;
  aPlaying: boolean;
  bPlaying: boolean;
}) => void;

export class DjEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private xfader = -0.15;
  private targetBpm: number | null = null;
  private ticks = new Set<TickFn>();
  private pumping = false;
  private raf = 0;
  private mixTimer = 0;
  private remixDuck = 1;
  private renderController: AbortController | null = null;
  private renderedBuffer: AudioBuffer | null = null;
  private renderedPlan: MixPlan | null = null;
  vocalSemitones = 0;
  private remixSource: AudioBufferSourceNode | null = null;
  private remixPlaying = false;
  private remixOrigin = 0;
  private remixDuration = 0;
  private decks: Record<DeckId, DeckNodes>;

  constructor() {
    this.decks = {
      a: this.blankDeck("a", "Deck A"),
      b: this.blankDeck("b", "Deck B"),
    };
  }

  private blankDeck(id: DeckId, name: string): DeckNodes {
    return {
      buffer: null,
      info: emptyInfo(id, name),
      source: null,
      gain: null,
      low: null,
      mid: null,
      high: null,
      hp: null,
      playing: false,
      originTime: 0,
      startOffset: 0,
      rate: 1,
      volume: 0.92,
      eq: { low: 0, mid: 0, high: 0 },
      filter: 0,
    };
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  isPlaying(): boolean {
    return this.remixPlaying || this.decks.a.playing || this.decks.b.playing;
  }

  isDeckPlaying(id: DeckId): boolean {
    return this.decks[id].playing;
  }

  xfaderValue(): number {
    return this.xfader;
  }

  deck(id: DeckId): DeckInfo {
    return this.decks[id].info;
  }

  rawBuffer(id: DeckId): AudioBuffer | null {
    return this.decks[id].buffer;
  }

  deckTime(id: DeckId): number {
    if (this.remixPlaying && this.ctx) {
      return Math.min(this.remixDuration, Math.max(0, this.ctx.currentTime - this.remixOrigin));
    }
    const d = this.decks[id];
    if (!this.ctx || !d.playing) return d.startOffset;
    const elapsed = (this.ctx.currentTime - d.originTime) * d.rate;
    const dur = d.info.duration;
    if (!dur) return d.startOffset;
    const pos = d.startOffset + elapsed;
    return d.info.looping ? pos % dur : Math.min(dur, pos);
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
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.92;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3.2;
    master.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);
    this.master = master;
    this.analyser = analyser;
    this.wireDeck("a");
    this.wireDeck("b");
    this.applyXfader(this.xfader);
    if (ctx.state === "suspended") {
      await Promise.race([
        ctx.resume(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 400)),
      ]);
    }
    this.startPump();
  }

  async decodeFile(file: File): Promise<AudioBuffer> {
    await this.ensure();
    if (!this.ctx) throw new Error("Audio is not ready.");
    const data = await file.arrayBuffer();
    return this.ctx.decodeAudioData(data.slice(0));
  }

  loadUpload(id: DeckId, buffer: AudioBuffer, name: string, guess?: BpmGuess) {
    const g = guess ?? detectBpm(buffer);
    this.setBuffer(id, buffer, name.replace(/\.[^.]+$/, ""), g.bpm, false, g);
  }

  setBuffer(
    id: DeckId,
    buffer: AudioBuffer,
    name: string,
    bpm: number,
    looping: boolean,
    guess?: BpmGuess,
  ) {
    this.invalidateRender();
    const d = this.decks[id];
    this.stopDeck(id);
    d.buffer = buffer;
    d.info = {
      id,
      name,
      bpm,
      duration: buffer.duration,
      offset: guess?.offset ?? 0,
      peaks: guess?.peaks ?? waveformPeaks(buffer),
      looping,
      hasTrack: true,
    };
    d.rate = this.rateFor(id);
    this.emit();
  }

  setXfader(v: number) {
    this.xfader = Math.max(-1, Math.min(1, v));
    this.applyXfader(this.xfader);
    this.emit();
  }

  setVolume(id: DeckId, v: number) {
    const d = this.decks[id];
    d.volume = Math.max(0, Math.min(1, v));
    this.applyXfader(this.xfader);
  }

  setEq(id: DeckId, band: "low" | "mid" | "high", v: number) {
    const d = this.decks[id];
    d.eq[band] = Math.max(-1, Math.min(1, v));
    const node = band === "low" ? d.low : band === "mid" ? d.mid : d.high;
    if (node && this.ctx) node.gain.setTargetAtTime(d.eq[band] * 10, this.ctx.currentTime, 0.04);
  }

  setFilter(id: DeckId, v: number) {
    const d = this.decks[id];
    d.filter = Math.max(0, Math.min(1, v));
    this.applyFilter(id);
  }

  syncToA() {
    this.targetBpm = this.decks.a.info.bpm || 120;
    this.decks.a.rate = this.rateFor("a");
    this.decks.b.rate = this.rateFor("b");
    this.retriggerRates();
    this.emit();
  }

  setTargetBpm(bpm: number) {
    this.targetBpm = bpm;
    this.decks.a.rate = this.rateFor("a");
    this.decks.b.rate = this.rateFor("b");
    this.retriggerRates();
  }

  async playDeck(id: DeckId, offset?: number, when?: number) {
    await this.ensure();
    const d = this.decks[id];
    if (!this.ctx || !d.buffer || !d.gain) return;
    this.stopSource(id);
    const src = this.ctx.createBufferSource();
    src.buffer = d.buffer;
    src.loop = d.info.looping;
    src.playbackRate.value = d.rate;
    src.connect(d.hp ?? d.gain);
    const startAt = when ?? this.ctx.currentTime;
    const off = Math.max(0, Math.min(d.info.duration - 0.05, offset ?? d.startOffset));
    try {
      src.start(startAt, off);
    } catch {
      return;
    }
    src.onended = () => {
      if (d.source === src) {
        d.playing = false;
        this.emit();
      }
    };
    d.source = src;
    d.playing = true;
    d.startOffset = off;
    d.originTime = startAt;
    this.emit();
  }

  pauseDeck(id: DeckId) {
    const d = this.decks[id];
    if (d.playing) d.startOffset = this.deckTime(id);
    this.stopSource(id);
    d.playing = false;
    this.emit();
  }

  stopDeck(id: DeckId) {
    const d = this.decks[id];
    this.stopSource(id);
    d.playing = false;
    d.startOffset = 0;
    this.emit();
  }

  stopAll() {
    this.renderController?.abort();
    this.renderController = null;
    this.clearMixTimer();
    this.stopRemix();
    this.remixDuck = 1;
    this.stopDeck("a");
    this.stopDeck("b");
  }

  seekDeck(id: DeckId, seconds: number) {
    const d = this.decks[id];
    const next = Math.max(0, Math.min(d.info.duration, seconds));
    const was = d.playing;
    this.stopSource(id);
    d.startOffset = next;
    d.playing = false;
    this.emit();
    if (was) void this.playDeck(id, next);
  }

  async playBoth() {
    await this.ensure();
    this.syncToA();
    await this.playDeck("a", this.decks.a.startOffset);
    await this.playDeck("b", this.decks.b.startOffset);
  }

  async runPlan(plan: MixPlan) {
    await this.ensure();
    if (!this.ctx) return;
    this.stopAll();
    const sourceA = this.decks.a.buffer;
    if (!sourceA) return;
    if (plan.job !== "remix" && !this.decks.b.buffer) return;
    const controller = new AbortController();
    this.renderController = controller;
    const buffer = this.renderedPlan === plan && this.renderedBuffer ? this.renderedBuffer : await renderRemix({
      sourceA,
      sourceB: plan.job === "remix" ? null : this.decks.b.buffer,
      bpmA: this.decks.a.info.bpm,
      bpmB: this.decks.b.info.bpm,
      offsetA: this.decks.a.info.offset,
      offsetB: this.decks.b.info.offset,
      plan,
      signal: controller.signal,
      vocalSemitones: plan.job === "stems" ? this.vocalSemitones : 0,
    });
    controller.signal.throwIfAborted();
    this.renderedBuffer = buffer;
    this.renderedPlan = plan;
    this.playRemixBuffer(buffer);
  }

  outputBuffer() { return this.renderedBuffer; }

  invalidateRender() {
    this.stopAll();
    this.renderedBuffer = null;
    this.renderedPlan = null;
  }

  setTiming(id: DeckId, bpm: number, offset: number) {
    this.invalidateRender();
    const info = this.decks[id].info;
    info.bpm = Math.min(180, Math.max(70, bpm));
    info.offset = Math.min(Math.max(0, info.duration - 0.1), Math.max(0, offset));
    this.emit();
  }

  private playRemixBuffer(buffer: AudioBuffer) {
    if (!this.ctx || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master);
    const now = this.ctx.currentTime + 0.05;
    try {
      src.start(now);
    } catch {
      return;
    }
    src.onended = () => {
      if (this.remixSource === src) {
        this.remixPlaying = false;
        this.remixSource = null;
        this.emit();
      }
    };
    this.remixSource = src;
    this.remixPlaying = true;
    this.remixOrigin = now;
    this.remixDuration = buffer.duration;
    this.emit();
  }

  private stopRemix() {
    try {
      this.remixSource?.stop();
    } catch {
      /* already stopped */
    }
    this.remixSource = null;
    this.remixPlaying = false;
    this.remixDuration = 0;
  }

  private applyRemixTone(plan: MixPlan) {
    const remix = plan.job === "remix" || plan.job === "both";
    const bass = remix ? plan.bassBoost : 0;
    const mid = remix ? plan.midCut : 0;
    const air = remix ? plan.air : 0;
    this.setEq("a", "low", bass);
    this.setEq("a", "mid", mid);
    this.setEq("a", "high", air);
    this.setEq("b", "low", remix ? bass * 0.85 : 0);
    this.setEq("b", "mid", remix ? mid : 0);
    this.setEq("b", "high", remix ? air : 0);
  }

  private animateJob(plan: MixPlan, remixOnly: boolean) {
    const t0 = performance.now();
    const mixInMs = plan.mixInSec * 1000;
    const fadeMs = plan.crossfadeSec * 1000;
    const holdMs = (plan.holdSec + plan.dropSec) * 1000;
    const dropMs = plan.dropSec * 1000;
    const beatMs = (60 / Math.max(70, plan.targetBpm)) * 1000;
    const tick = () => {
      const t = performance.now() - t0;
      if (plan.pump) {
        const phase = (t % beatMs) / beatMs;
        this.remixDuck = 0.74 + 0.26 * phase;
      } else {
        this.remixDuck = 1;
      }
      if (remixOnly) {
        if (plan.sweepA) {
          const u = Math.min(1, t / Math.max(400, dropMs));
          this.setFilter("a", 0.55 * (1 - u));
        }
        this.setXfader(-1);
      } else if (t < mixInMs) {
        this.setXfader(-1);
        if (plan.sweepA) this.setFilter("a", 0);
      } else if (t < mixInMs + fadeMs) {
        const u = (t - mixInMs) / fadeMs;
        this.setXfader(-1 + u * 2);
        if (plan.sweepA) this.setFilter("a", u);
      } else {
        this.setXfader(1);
        if (plan.sweepA) this.setFilter("a", 1);
      }
      this.applyXfader(this.xfader);
      if (t < mixInMs + fadeMs + holdMs) {
        this.mixTimer = window.requestAnimationFrame(tick);
      }
    };
    this.mixTimer = window.requestAnimationFrame(tick);
  }

  private rateFor(id: DeckId): number {
    const native = this.decks[id].info.bpm || 120;
    const target = this.targetBpm ?? native;
    const rate = target / native;
    return Math.min(1.35, Math.max(0.72, rate));
  }

  private wireDeck(id: DeckId) {
    if (!this.ctx || !this.master) return;
    const d = this.decks[id];
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 40;
    hp.Q.value = 0.7;
    const low = this.ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 120;
    const mid = this.ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 0.9;
    const high = this.ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 8000;
    const gain = this.ctx.createGain();
    hp.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(gain);
    gain.connect(this.master);
    d.hp = hp;
    d.low = low;
    d.mid = mid;
    d.high = high;
    d.gain = gain;
  }

  private applyXfader(x: number) {
    const a = Math.cos(((x + 1) / 2) * (Math.PI / 2));
    const b = Math.sin(((x + 1) / 2) * (Math.PI / 2));
    const t = this.ctx?.currentTime ?? 0;
    const duck = this.remixDuck;
    this.decks.a.gain?.gain.setTargetAtTime(a * this.decks.a.volume * duck, t, 0.03);
    this.decks.b.gain?.gain.setTargetAtTime(b * this.decks.b.volume * duck, t, 0.03);
  }

  private applyFilter(id: DeckId) {
    const d = this.decks[id];
    if (!d.hp || !this.ctx) return;
    const hz = 40 * Math.pow(120, d.filter);
    d.hp.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.05);
  }

  private stopSource(id: DeckId) {
    const d = this.decks[id];
    try {
      d.source?.stop();
    } catch {
      /* already stopped */
    }
    d.source = null;
  }

  private retriggerRates() {
    (["a", "b"] as DeckId[]).forEach((id) => {
      const d = this.decks[id];
      if (d.source) d.source.playbackRate.value = d.rate;
    });
  }

  private clearMixTimer() {
    if (this.mixTimer) cancelAnimationFrame(this.mixTimer);
    this.mixTimer = 0;
  }

  private emit() {
    this.ticks.forEach((fn) =>
      fn({
        a: this.deckTime("a"),
        b: this.deckTime("b"),
        xfader: this.xfader,
        playing: this.isPlaying(),
        aPlaying: this.decks.a.playing || this.remixPlaying,
        bPlaying: this.decks.b.playing,
      }),
    );
  }

  private pump = () => {
    this.emit();
    this.raf = requestAnimationFrame(this.pump);
  };

  private startPump() {
    if (this.pumping) return;
    this.pumping = true;
    this.raf = requestAnimationFrame(this.pump);
  }
}

export const djEngine = new DjEngine();
