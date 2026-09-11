import { create } from "zustand";
import {
  audioDecodeErrorMessage,
  classifyAudioFile,
  displayTrackName,
} from "@/lib/audio-file";
import {
  aiBeatDeckName,
  remixBpmForStyle,
  renderAiBeat,
  syntheticPeaks,
  type GrooveStyle,
} from "@/lib/ai-beat";
import { detectBpm } from "@/lib/bpm";
import { fallbackPlan, planMix, type MixPlan } from "@/lib/dj-api";
import { djEngine, type DeckId, type DeckInfo } from "@/lib/dj-engine";
import { engine as studioEngine } from "@/lib/audio-engine";
import type { BoothMode } from "@/lib/booth-mode";

const MAX_BYTES = 40 * 1024 * 1024;

export type BoothStatus = "idle" | "loading" | "planning" | "mixing" | "error";

type BoothState = {
  ready: boolean;
  mode: BoothMode;
  status: BoothStatus;
  statusText: string;
  error: string | null;
  prompt: string;
  cue: string | null;
  plan: MixPlan | null;
  usedAi: boolean | null;
  needsUpgrade: boolean;
  /** Remix: AI DJ groove style for the generated beat bed. */
  grooveStyle: GrooveStyle;
  /** Remix: true when deck B is an AI-generated beat (not a user upload). */
  aiBeatActive: boolean;
  xfader: number;
  playing: boolean;
  playingA: boolean;
  playingB: boolean;
  timeA: number;
  timeB: number;
  deckA: DeckInfo;
  deckB: DeckInfo;
  volA: number;
  volB: number;
  eqA: { low: number; mid: number; high: number };
  eqB: { low: number; mid: number; high: number };
  hydrate: () => Promise<void>;
  setMode: (mode: BoothMode) => void;
  setPrompt: (v: string) => void;
  setGrooveStyle: (style: GrooveStyle) => Promise<void>;
  armAiBeat: () => Promise<void>;
  setXfader: (v: number) => void;
  setVolume: (id: DeckId, v: number) => void;
  setEq: (id: DeckId, band: "low" | "mid" | "high", v: number) => void;
  loadFile: (id: DeckId, file: File) => Promise<void>;
  playDeck: (id: DeckId) => Promise<void>;
  pauseDeck: (id: DeckId) => void;
  seekDeck: (id: DeckId, seconds: number) => void;
  syncB: () => void;
  dropMix: () => Promise<void>;
  runLocalMix: () => Promise<void>;
  playMash: () => Promise<void>;
  pauseMix: () => void;
  stopMix: () => void;
};

let tickBound = false;
let lastTickMs = 0;
let mixGeneration = 0;
let mixInFlight = false;

function snapshot(): Pick<
  BoothState,
  | "xfader"
  | "playing"
  | "playingA"
  | "playingB"
  | "timeA"
  | "timeB"
  | "deckA"
  | "deckB"
> {
  return {
    xfader: djEngine.xfaderValue(),
    playing: djEngine.isPlaying(),
    playingA: djEngine.isDeckPlaying("a"),
    playingB: djEngine.isDeckPlaying("b"),
    timeA: djEngine.deckTime("a"),
    timeB: djEngine.deckTime("b"),
    deckA: { ...djEngine.deck("a") },
    deckB: { ...djEngine.deck("b") },
  };
}

async function runEnginePlan(
  plan: MixPlan,
  mode: BoothMode,
  gen: number,
  set: (partial: Partial<BoothState>) => void,
) {
  await djEngine.runPlan(plan, {
    booth: mode,
    onCue: (text) => {
      if (gen !== mixGeneration) return;
      set({ statusText: text, cue: text });
    },
    onComplete: () => {
      if (gen !== mixGeneration) return;
      set({
        status: "idle",
        statusText: plan.cue || "Mix complete.",
        ...snapshot(),
      });
    },
  });
  if (gen === mixGeneration) set(snapshot());
}

/** Remix: put a looping AI beat on B, locked to the song BPM. */
async function ensureRemixBeat(
  get: () => BoothState,
  set: (partial: Partial<BoothState>) => void,
): Promise<boolean> {
  const { deckA, grooveStyle, aiBeatActive, deckB } = get();
  if (!deckA.hasTrack) {
    set({
      status: "error",
      error: "Load a song first — the AI DJ needs something to remix.",
      statusText: "Need a song.",
    });
    return false;
  }
  // Keep a user-uploaded beat unless we're in AI-beat mode.
  if (deckB.hasTrack && !aiBeatActive) return true;

  await djEngine.ensure();
  const songBpm = Math.round(deckA.bpm || 120);
  const bpm = remixBpmForStyle(songBpm, grooveStyle);
  const proxy = {
    sampleRate: djEngine.sampleRate(),
    createBuffer: (ch: number, len: number, rate: number) =>
      djEngine.createBuffer(ch, len, rate),
  } as AudioContext;
  const buffer = renderAiBeat(proxy, { bpm, style: grooveStyle, bars: 16 });
  const name = aiBeatDeckName(grooveStyle, bpm);
  djEngine.loadAiBeat("b", buffer, name, bpm, syntheticPeaks(buffer));
  set({
    aiBeatActive: true,
    statusText: `${name} armed`,
    ...snapshot(),
  });
  return true;
}

export const useBooth = create<BoothState>((set, get) => ({
  ready: false,
  mode: "remix",
  status: "idle",
  statusText: "Load a song — the AI DJ brings the beat.",
  error: null,
  prompt: "",
  cue: null,
  plan: null,
  usedAi: null,
  needsUpgrade: false,
  grooveStyle: "edm",
  aiBeatActive: false,
  xfader: -0.15,
  playing: false,
  playingA: false,
  playingB: false,
  timeA: 0,
  timeB: 0,
  deckA: djEngine.deck("a"),
  deckB: djEngine.deck("b"),
  volA: 0.92,
  volB: 0.92,
  eqA: { low: 0, mid: 0, high: 0 },
  eqB: { low: 0, mid: 0, high: 0 },

  setMode: (mode) => {
    set({
      mode,
      statusText:
        mode === "remix"
          ? "Load a song — the AI DJ brings the beat."
          : "Load beats and lyrics you own.",
    });
  },

  setPrompt: (prompt) => set({ prompt }),

  setGrooveStyle: async (style) => {
    set({ grooveStyle: style, aiBeatActive: true });
    if (get().mode === "remix" && get().deckA.hasTrack) {
      await ensureRemixBeat(get, set);
    }
  },

  armAiBeat: async () => {
    set({ aiBeatActive: true });
    await ensureRemixBeat(get, set);
  },

  setXfader: (v) => {
    djEngine.setXfader(v);
    set({ xfader: v });
  },

  setVolume: (id, v) => {
    djEngine.setVolume(id, v);
    set(id === "a" ? { volA: v } : { volB: v });
  },

  setEq: (id, band, v) => {
    djEngine.setEq(id, band, v);
    if (id === "a") set((s) => ({ eqA: { ...s.eqA, [band]: v } }));
    else set((s) => ({ eqB: { ...s.eqB, [band]: v } }));
  },

  hydrate: async () => {
    if (!tickBound) {
      tickBound = true;
      djEngine.onTick((t) => {
        const now = performance.now();
        if (t.playing && now - lastTickMs < 50) return;
        lastTickMs = now;
        set({
          timeA: t.a,
          timeB: t.b,
          xfader: t.xfader,
          playing: t.playing,
          playingA: t.aPlaying,
          playingB: t.bPlaying,
        });
      });
    }
    if (get().ready) return;
    studioEngine.stop();
    await djEngine.ensure();
    set({
      ready: true,
      status: "idle",
      statusText:
        get().mode === "remix"
          ? "Load a song — the AI DJ brings the beat."
          : "Load beats and lyrics you own.",
      error: null,
      ...snapshot(),
    });
  },

  loadFile: async (id, file) => {
    const verdict = classifyAudioFile(file);
    if (verdict === "no") {
      set({
        status: "error",
        error:
          "That file is not audio. On iPhone, choose an M4A or MP3 from Files or Voice Memos.",
        statusText: "Need an audio file.",
      });
      return;
    }
    if (file.size <= 0) {
      set({
        status: "error",
        error: "That file is empty.",
        statusText: "Need an audio file.",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      set({
        status: "error",
        error: "Keep each track under 40 MB.",
        statusText: "File too heavy.",
      });
      return;
    }
    const label = displayTrackName(file);
    set({
      status: "loading",
      statusText: `Reading ${label}`,
      error: null,
    });
    try {
      studioEngine.stop();
      const buffer = await djEngine.decodeFile(file);
      const guess = detectBpm(buffer);
      djEngine.loadUpload(id, buffer, label, guess);
      set({
        status: "idle",
        statusText: `${label} · ${guess.bpm} BPM`,
        plan: null,
        usedAi: null,
        cue: null,
        aiBeatActive: id === "b" ? false : get().aiBeatActive,
        ...snapshot(),
      });
      if (get().mode === "remix" && id === "a") {
        set({ aiBeatActive: true });
        await ensureRemixBeat(get, set);
      }
    } catch (err) {
      set({
        status: "error",
        error: audioDecodeErrorMessage(err),
        statusText: "Could not read the track.",
      });
    }
  },

  playDeck: async (id) => {
    studioEngine.stop();
    await djEngine.playDeck(id);
    set(snapshot());
  },

  pauseDeck: (id) => {
    djEngine.pauseDeck(id);
    set(snapshot());
  },

  seekDeck: (id, seconds) => {
    djEngine.seekDeck(id, seconds);
    set(snapshot());
  },

  syncB: () => {
    djEngine.syncToA();
    const { mode, aiBeatActive } = get();
    const bpm = djEngine.deck("a").bpm;
    set({
      statusText:
        mode === "mashup"
          ? `Lyrics locked to ${bpm} BPM beats`
          : aiBeatActive
            ? `AI beat locked to ${bpm} BPM song`
            : `New beat locked to ${bpm} BPM song`,
      ...snapshot(),
    });
  },

  dropMix: async () => {
    const { prompt, mode } = get();
    if (mode === "remix") {
      const ok = await ensureRemixBeat(get, set);
      if (!ok) return;
    }

    const { deckA, deckB } = get();
    if (!deckA.hasTrack || !deckB.hasTrack) {
      set({
        status: "error",
        error:
          mode === "mashup"
            ? "Load a beat bed and a lyrics track first."
            : "Load a song first — the AI DJ will bring the beat.",
        statusText:
          mode === "mashup" ? "Need beats and lyrics." : "Need a song.",
      });
      return;
    }
    if (mixInFlight) return;
    mixInFlight = true;
    const gen = ++mixGeneration;

    studioEngine.stop();
    set({
      status: "planning",
      statusText:
        mode === "mashup"
          ? "Building the mashup…"
          : "AI DJ writing the remix…",
      error: null,
      cue: null,
      needsUpgrade: false,
    });

    const input = {
      nameA: deckA.name,
      nameB: deckB.name,
      bpmA: deckA.bpm,
      bpmB: deckB.bpm,
      durationA: deckA.duration,
      durationB: deckB.duration,
      prompt: prompt.trim(),
      mode,
    };

    try {
      let plan: MixPlan = fallbackPlan(input);
      let usedAi = false;

      try {
        const res = await planMix({ data: input });
        if (gen !== mixGeneration) return;

        if (!res.ok && "needsUpgrade" in res && res.needsUpgrade) {
          set({
            plan: null,
            cue: null,
            usedAi: null,
            needsUpgrade: true,
            status: "idle",
            statusText:
              "AI DJ needs a plan — pick one below, or continue free.",
            error: res.error,
          });
          return;
        }

        plan = res.plan;
        usedAi = Boolean(res.ok && res.usedAi);
      } catch (err) {
        if (gen !== mixGeneration) return;
        plan = fallbackPlan(input);
        usedAi = false;
        set({
          error:
            err instanceof Error
              ? `${err.message} — playing local DJ set.`
              : "AI planner failed — playing local DJ set.",
        });
      }

      if (gen !== mixGeneration) return;

      set({
        plan,
        cue: plan.cue,
        usedAi,
        needsUpgrade: false,
        status: "mixing",
        statusText: usedAi
          ? mode === "remix"
            ? `AI DJ on the decks — ${plan.cue}`
            : plan.cue
          : `${plan.cue} (local)`,
        error: get().error,
      });

      await runEnginePlan(plan, mode, gen, set);
    } finally {
      mixInFlight = false;
    }
  },

  runLocalMix: async () => {
    const { prompt, mode } = get();
    if (mode === "remix") {
      const ok = await ensureRemixBeat(get, set);
      if (!ok) return;
    }
    const { deckA, deckB } = get();
    if (!deckA.hasTrack || !deckB.hasTrack) {
      set({
        status: "error",
        error:
          mode === "mashup"
            ? "Load a beat bed and a lyrics track first."
            : "Load a song first — the AI DJ will bring the beat.",
        statusText:
          mode === "mashup" ? "Need beats and lyrics." : "Need a song.",
      });
      return;
    }
    if (mixInFlight) return;
    mixInFlight = true;
    const gen = ++mixGeneration;

    studioEngine.stop();
    const input = {
      nameA: deckA.name,
      nameB: deckB.name,
      bpmA: deckA.bpm,
      bpmB: deckB.bpm,
      durationA: deckA.duration,
      durationB: deckB.duration,
      prompt: prompt.trim(),
      mode,
    };
    const plan = fallbackPlan(input);
    set({
      plan,
      cue: plan.cue,
      usedAi: false,
      needsUpgrade: false,
      status: "mixing",
      statusText: `${plan.cue} (local)`,
      error: null,
    });
    try {
      await runEnginePlan(plan, mode, gen, set);
    } finally {
      mixInFlight = false;
    }
  },

  playMash: async () => {
    const { plan, mode, needsUpgrade } = get();
    if (needsUpgrade) {
      await get().runLocalMix();
      return;
    }
    if (plan) {
      if (mixInFlight) return;
      mixInFlight = true;
      const gen = ++mixGeneration;
      studioEngine.stop();
      set({ status: "mixing", statusText: plan.cue, error: null });
      try {
        await runEnginePlan(plan, mode, gen, set);
      } finally {
        mixInFlight = false;
      }
      return;
    }
    await get().dropMix();
  },

  pauseMix: () => {
    mixGeneration += 1;
    mixInFlight = false;
    djEngine.pauseAll();
    set({
      status: "idle",
      statusText: "Paused.",
      ...snapshot(),
    });
  },

  stopMix: () => {
    mixGeneration += 1;
    mixInFlight = false;
    djEngine.stopAll();
    set({
      status: "idle",
      statusText: "Stopped.",
      ...snapshot(),
      timeA: 0,
      timeB: 0,
      playing: false,
      playingA: false,
      playingB: false,
    });
  },
}));
