import { create } from "zustand";
import {
  audioDecodeErrorMessage,
  classifyAudioFile,
  displayTrackName,
} from "@/lib/audio-file";
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
  /** true when last applied plan came from the AI path and was charged */
  usedAi: boolean | null;
  needsUpgrade: boolean;
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

export const useBooth = create<BoothState>((set, get) => ({
  ready: false,
  mode: "remix",
  status: "idle",
  statusText: "Load song A and song B.",
  error: null,
  prompt: "",
  cue: null,
  plan: null,
  usedAi: null,
  needsUpgrade: false,
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

  setMode: (mode) => set({ mode }),

  setPrompt: (prompt) => set({ prompt }),

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
        // ~20 Hz is enough for meters; still update immediately when stopped.
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
      statusText: "Load two tracks you own, then mash them.",
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
        ...snapshot(),
      });
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
    set({
      statusText: `B locked to ${djEngine.deck("a").bpm} BPM`,
      ...snapshot(),
    });
  },

  dropMix: async () => {
    const { deckA, deckB, prompt, mode } = get();
    if (!deckA.hasTrack || !deckB.hasTrack) {
      set({
        status: "error",
        error: "Load both songs first.",
        statusText: "Need song A and song B.",
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
        mode === "mashup" ? "Building the mashup…" : "Building the remix…",
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
            statusText: "AI planning needs a plan — pick one below, or continue free.",
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
              ? `${err.message} — playing local phrase lock.`
              : "AI planner failed — playing local phrase lock.",
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
          ? plan.cue
          : `${plan.cue} (local)`,
        error: get().error,
      });

      await runEnginePlan(plan, mode, gen, set);
    } finally {
      mixInFlight = false;
    }
  },

  runLocalMix: async () => {
    const { deckA, deckB, prompt, mode } = get();
    if (!deckA.hasTrack || !deckB.hasTrack) {
      set({
        status: "error",
        error: "Load both songs first.",
        statusText: "Need song A and song B.",
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
    // Don't re-trigger AI planner from Play when paywalled — use local.
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
