import { detectBpm, waveformPeaks, type BpmGuess } from "@/lib/bpm";
import type { MixPlan } from "@/lib/dj-api";

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

export type RunPlanOptions = {
  /** Mashup keeps beats+lyrics blended; remix hands the song onto the new beat. */
  booth?: "mashup" | "remix";
  /** Live DJ call as the performance advances. */
  onCue?: (text: string) => void;
  onComplete?: () => void;
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
  /** AudioContext time when playback at startOffset began (or will begin). */
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
    return this.decks.a.playing || this.decks.b.playing;
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

  deckEq(id: DeckId): { low: number; mid: number; high: number } {
    return { ...this.decks[id].eq };
  }

  /**
   * Position in the buffer (audio seconds), stable across playbackRate changes.
   * Scheduled-but-not-started sources report startOffset (no negative times).
   */
  deckTime(id: DeckId): number {
    const d = this.decks[id];
    if (!this.ctx || !d.playing) return d.startOffset;
    const elapsed = (this.ctx.currentTime - d.originTime) * d.rate;
    if (elapsed < 0) return d.startOffset;
    const dur = d.info.duration;
    if (!dur) return d.startOffset;
    const pos = d.startOffset + elapsed;
    return d.info.looping ? pos % dur : Math.min(dur, Math.max(0, pos));
  }

  onTick(fn: TickFn): () => void {
    this.ticks.add(fn);
    return () => this.ticks.delete(fn);
  }

  /** Sample rate of the live audio context (after ensure()). */
  sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  /** Create an empty buffer in the live context. */
  createBuffer(
    channels: number,
    length: number,
    sampleRate: number,
  ): AudioBuffer {
    if (!this.ctx) throw new Error("Audio is not ready.");
    return this.ctx.createBuffer(channels, length, sampleRate);
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

  loadUpload(id: DeckId, buffer: AudioBuffer, name: string, guess?: BpmGuess) {
    const g = guess ?? detectBpm(buffer);
    this.setBuffer(id, buffer, name.replace(/\.[^.]+$/, ""), g.bpm, false, g);
  }

  /** Load a looping AI DJ beat bed onto a deck. */
  loadAiBeat(
    id: DeckId,
    buffer: AudioBuffer,
    name: string,
    bpm: number,
    peaks?: number[],
  ) {
    this.setBuffer(id, buffer, name, bpm, true, {
      bpm,
      offset: 0,
      peaks: peaks ?? waveformPeaks(buffer),
    });
  }

  setBuffer(
    id: DeckId,
    buffer: AudioBuffer,
    name: string,
    bpm: number,
    looping: boolean,
    guess?: BpmGuess,
  ) {
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
    if (node && this.ctx) {
      node.gain.setTargetAtTime(d.eq[band] * 10, this.ctx.currentTime, 0.04);
    }
  }

  setFilter(id: DeckId, v: number) {
    const d = this.decks[id];
    d.filter = Math.max(0, Math.min(1, v));
    this.applyFilter(id);
  }

  syncToA() {
    this.targetBpm = this.decks.a.info.bpm || 120;
    this.applyRate("a", this.rateFor("a"));
    this.applyRate("b", this.rateFor("b"));
    this.emit();
  }

  setTargetBpm(bpm: number) {
    this.targetBpm = bpm;
    this.applyRate("a", this.rateFor("a"));
    this.applyRate("b", this.rateFor("b"));
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
    const off = Math.max(
      0,
      Math.min(d.info.duration - 0.05, offset ?? d.startOffset),
    );
    try {
      src.start(startAt, off);
    } catch (err) {
      console.error("[dj] playDeck failed", id, err);
      return;
    }
    src.onended = () => {
      if (d.source === src) {
        d.playing = false;
        d.startOffset = d.info.looping ? 0 : d.info.duration;
        this.emit();
        this.ensurePump();
      }
    };
    d.source = src;
    d.playing = true;
    d.startOffset = off;
    d.originTime = startAt;
    this.emit();
    this.ensurePump();
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
    this.clearMixTimer();
    this.stopDeck("a");
    this.stopDeck("b");
  }

  /** Pause both decks and cancel an in-flight mix automation. */
  pauseAll() {
    this.clearMixTimer();
    this.pauseDeck("a");
    this.pauseDeck("b");
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

  async runPlan(plan: MixPlan, opts: RunPlanOptions = {}) {
    await this.ensure();
    if (!this.ctx) return;
    this.stopAll();
    this.setTargetBpm(plan.targetBpm);

    const booth = opts.booth ?? "remix";
    const endXfader = booth === "mashup" ? 0.15 : 1;
    const calls = plan.calls?.length
      ? plan.calls
      : [plan.cue || (booth === "mashup" ? "Locking the mash…" : "AI DJ taking the decks…")];
    let callIdx = 0;
    const say = (fallback: string) => {
      const text = calls[callIdx] ?? fallback;
      callIdx += 1;
      opts.onCue?.(text);
    };

    this.setXfader(-1);
    this.setFilter("a", 0);
    this.setFilter("b", 0);
    this.setEq("a", "low", 0);
    this.setEq("a", "mid", 0);
    this.setEq("a", "high", 0);
    this.setEq("b", "low", plan.bassSwap ? -1 : 0);
    this.setEq("b", "mid", 0);
    this.setEq("b", "high", 0);
    // Incoming deck starts filtered so the tease feels like a real DJ cue.
    this.setFilter("b", booth === "remix" ? 0.55 : 0.25);

    const rateA = this.decks.a.rate || 1;
    const introTrack = Math.max(0, plan.introSec || plan.mixInSec || 0);
    const teaseTrack = Math.max(0, plan.teaseSec || 0);
    // Track seconds → wall-clock for scheduling under rate.
    const introWall = Math.max(0.2, introTrack / rateA);
    const teaseWall = Math.max(0, teaseTrack / rateA);
    const fadeWall = Math.max(0.08, plan.crossfadeSec);
    const holdWall = Math.max(0, plan.holdSec);

    const aOff =
      plan.aOffsetSec > 0.05
        ? plan.aOffsetSec
        : this.decks.a.info.offset || 0;
    const bOff =
      plan.bOffsetSec > 0.05
        ? plan.bOffsetSec
        : this.decks.b.info.offset || 0;

    const now = this.ctx.currentTime + 0.08;
    await this.playDeck("a", aOff, now);
    // Arm B when intro ends — then tease before the main drop.
    await this.playDeck("b", bOff, now + introWall);

    const t0 = performance.now();
    const introMs = introWall * 1000;
    const teaseMs = teaseWall * 1000;
    const fadeMs = fadeWall * 1000;
    const holdMs = holdWall * 1000;
    const dropStart = introMs + teaseMs;
    const dropEnd = dropStart + fadeMs;
    const totalMs = dropEnd + holdMs;
    const isCut = plan.style === "cut" || plan.technique === "power_cut";

    let phase: "intro" | "tease" | "drop" | "ride" | "done" = "intro";
    say(
      booth === "mashup"
        ? "Riding the beat bed…"
        : "AI DJ riding the original…",
    );

    const tick = () => {
      const t = performance.now() - t0;

      if (t < introMs) {
        // INTRO — solo A
        this.setXfader(-1);
        if (plan.bassSwap) {
          this.setEq("a", "low", 0);
          this.setEq("b", "low", -1);
        }
      } else if (t < dropStart) {
        // TEASE — crack B in quietly; open its filter a bit
        if (phase === "intro") {
          phase = "tease";
          say(
            booth === "mashup"
              ? "Bringing lyrics into the pocket…"
              : "Teasing the new beat…",
          );
        }
        const u = teaseMs <= 0 ? 1 : Math.min(1, (t - introMs) / teaseMs);
        const teaseX = -1 + u * 0.35; // peek toward B without committing
        this.setXfader(teaseX);
        this.setFilter("b", Math.max(0, 0.55 - u * 0.45));
        if (plan.bassSwap) {
          this.setEq("b", "low", -1 + u * 0.35);
        }
        if (plan.technique === "echo_out" || plan.sweepA) {
          this.setFilter("a", u * 0.15);
        }
      } else if (t < dropEnd) {
        // DROP — main DJ move
        if (phase === "intro" || phase === "tease") {
          phase = "drop";
          say(
            isCut
              ? "Power cut — new groove takes the floor."
              : booth === "mashup"
                ? "Locking the mash…"
                : "Dropping the remix…",
          );
        }
        const u = Math.min(1, (t - dropStart) / fadeMs);
        const shaped = isCut ? Math.min(1, u * 12) : u * u * (3 - 2 * u);
        const x = -1 + shaped * (1 + endXfader);
        this.setXfader(Math.min(endXfader, x));
        this.setFilter("b", Math.max(0, 0.2 * (1 - shaped)));

        if (plan.sweepA || plan.technique === "filter_blend") {
          this.setFilter("a", shaped);
        }
        if (plan.technique === "echo_out") {
          this.setFilter("a", Math.min(1, shaped * 1.25));
          this.setEq("a", "high", shaped * 0.5);
          this.setEq("a", "mid", -shaped * 0.3);
          this.setEq("a", "low", -shaped * 0.85);
        }
        if (plan.bassSwap) {
          this.setEq("a", "low", -shaped);
          this.setEq("b", "low", -1 + shaped);
        }
      } else {
        // RIDE
        if (phase !== "ride" && phase !== "done") {
          phase = "ride";
          say(
            booth === "mashup"
              ? "Mash locked — both decks riding."
              : "Riding the new beat.",
          );
        }
        this.setXfader(endXfader);
        this.setFilter("b", 0);
        if (plan.sweepA || plan.technique === "echo_out") {
          this.setFilter("a", 1);
        }
        if (plan.bassSwap) {
          this.setEq("a", "low", -1);
          this.setEq("b", "low", 0);
        }
        if (booth === "remix" && this.decks.a.playing) {
          this.pauseDeck("a");
        }
      }

      if (t < totalMs) {
        this.mixTimer = window.requestAnimationFrame(tick);
        this.ensurePump();
      } else {
        phase = "done";
        this.mixTimer = 0;
        opts.onComplete?.();
        this.ensurePump();
      }
    };
    this.mixTimer = window.requestAnimationFrame(tick);
    this.ensurePump();
  }

  private rateFor(id: DeckId): number {
    const native = this.decks[id].info.bpm || 120;
    const target = this.targetBpm ?? native;
    const rate = target / native;
    return Math.min(1.35, Math.max(0.72, rate));
  }

  /** Change rate without jumping position (re-anchors originTime). */
  private applyRate(id: DeckId, rate: number) {
    const d = this.decks[id];
    if (d.playing && this.ctx) {
      const pos = this.deckTime(id);
      d.startOffset = Math.max(0, pos);
      d.originTime = this.ctx.currentTime;
    }
    d.rate = rate;
    if (d.source) d.source.playbackRate.value = rate;
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
    this.decks.a.gain?.gain.setTargetAtTime(a * this.decks.a.volume, t, 0.03);
    this.decks.b.gain?.gain.setTargetAtTime(b * this.decks.b.volume, t, 0.03);
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
        aPlaying: this.decks.a.playing,
        bPlaying: this.decks.b.playing,
      }),
    );
  }

  private pump = () => {
    this.emit();
    if (this.isPlaying() || this.mixTimer) {
      this.raf = requestAnimationFrame(this.pump);
    } else {
      this.pumping = false;
      this.raf = 0;
    }
  };

  private ensurePump() {
    if (this.pumping) return;
    this.pumping = true;
    this.raf = requestAnimationFrame(this.pump);
  }
}

export const djEngine = new DjEngine();
