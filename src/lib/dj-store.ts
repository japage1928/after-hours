import { encodeWav } from "@/lib/audio-export";
import { create } from "zustand";
import { detectBpm, analyzeTrack } from "@/lib/bpm";
import { fallbackPlan, planMix, type MixJob, type MixPlan } from "@/lib/dj-api";
import { djEngine, type DeckId, type DeckInfo } from "@/lib/dj-engine";
import { engine as studioEngine } from "@/lib/audio-engine";
import { listMashCuts, saveMashCut, type MashCut } from "@/lib/library-api";
import { makeAutomaticMashupStems } from "@/lib/stem-separation";

const MAX_BYTES = 20 * 1024 * 1024;

export type BoothStatus = "idle" | "loading" | "planning" | "rendering" | "mixing" | "error";

type BoothState = {
  hasOutput: boolean;
  vocalSemitones: number;
  setVocalSemitones: (value: number) => void;
  setTiming: (id: DeckId, bpm: number, offset: number) => void;
  download: () => void;
  ready: boolean;
  status: BoothStatus;
  statusText: string;
  error: string | null;
  prompt: string;
  cue: string | null;
  plan: MixPlan | null;
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
  recents: MashCut[];
  job: MixJob;
  hydrate: () => Promise<void>;
  setJob: (job: MixJob) => void;
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
  playMash: () => Promise<void>;
  stopMix: () => void;
};

let tickBound = false;
let revision = 0;
let separationController: AbortController | null = null;
const sourceFiles: Partial<Record<DeckId, File>> = {};

function cancelSeparation() {
  separationController?.abort();
  separationController = null;
}

function snapshot(): Pick<
  BoothState,
  "xfader" | "playing" | "playingA" | "playingB" | "timeA" | "timeB" | "deckA" | "deckB"
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

export const useBooth = create<BoothState>((set, get) => ({
  hasOutput: false,
  vocalSemitones: 0,
  setVocalSemitones: (value) => {
    revision++;
    cancelSeparation();
    djEngine.invalidateRender();
    djEngine.vocalSemitones = value;
    set({ vocalSemitones: value, plan: null, cue: null, hasOutput: false, status: "idle", ...snapshot() });
  },
  setTiming: (id, bpm, offset) => {
    revision++;
    cancelSeparation();
    djEngine.setTiming(id, bpm, offset);
    set({ plan: null, cue: null, hasOutput: false, status: "idle", ...snapshot() });
  },
  download: () => {
    const buffer = djEngine.outputBuffer();
    if (!buffer) return;
    const url = URL.createObjectURL(new Blob([encodeWav(buffer)], { type: "audio/wav" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mashup-pro-${get().job}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  },
  ready: false,
  status: "idle",
  statusText: "Pick mashup, remix, or both.",
  error: null,
  prompt: "",
  cue: null,
  plan: null,
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
  recents: [],
  job: "mashup",

  setJob: (job) => {
    revision++;
    cancelSeparation();
    djEngine.invalidateRender();
    const remix = job === "remix";
    set({
      job,
      hasOutput: false,
      error: null,
      ...snapshot(),
      plan: null,
      cue: null,
      status: "idle",
      statusText: remix
        ? "Load one song to remix."
        : job === "both"
          ? "Load two songs. We mash them and remix the blend."
          : job === "stems"
            ? "Load two ordinary songs. Demucs will extract instrumental A and vocals B automatically."
            : "Load song A and song B.",
    });
  },

  setPrompt: (prompt) => {
    revision++;
    cancelSeparation();
    djEngine.invalidateRender();
    set({ prompt, plan: null, cue: null, hasOutput: false, status: "idle", ...snapshot() });
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
    if (get().ready) {
      try {
        const recents = await listMashCuts();
        set({ recents });
      } catch {
        set({ recents: [] });
      }
      return;
    }
    studioEngine.stop();
    set({
      ready: true,
      status: "idle",
      statusText: "Load a song, then pick mashup, remix, or both.",
      ...snapshot(),
    });
    try {
      const recents = await listMashCuts();
      set({ recents });
    } catch {
      set({ recents: [] });
    }
  },

  loadFile: async (id, file) => {
    if (["loading", "planning", "rendering"].includes(get().status)) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) {
      set({ status: "error", error: "That file is not audio.", statusText: "Need an audio file." });
      return;
    }
    if (file.size > MAX_BYTES) {
      set({
        status: "error",
        error: "Keep each track under 20 MB.",
        statusText: "File too heavy.",
      });
      return;
    }
    const currentRevision = ++revision;
    cancelSeparation();
    sourceFiles[id] = file;
    djEngine.invalidateRender();
    set({
      plan: null, cue: null, hasOutput: false,
      status: "loading",
      statusText: `Reading ${file.name}`,
      error: null,
    });
    try {
      studioEngine.stop();
      const buffer = await djEngine.decodeFile(file);
      if (currentRevision !== revision) return;
      if (buffer.duration < 2 || buffer.duration > 600) throw new Error("Choose audio between 2 seconds and 10 minutes.");
      const guess = detectBpm(buffer);
      djEngine.loadUpload(id, buffer, file.name, guess);
      set({
        status: "idle",
        statusText: `${file.name.replace(/\.[^.]+$/, "")} · ${guess.bpm} BPM`,
        ...snapshot(),
      });
    } catch (err) {
      if (currentRevision !== revision) return;
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Could not decode that track.",
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
    set({ statusText: `B locked to ${djEngine.deck("a").bpm} BPM`, ...snapshot() });
  },

  dropMix: async () => {
    if (["loading", "planning", "rendering"].includes(get().status)) return;
    const currentRevision = ++revision;
    const { prompt, job } = get();
    let deckA = get().deckA;
    let deckB = get().deckB;
    if (!deckA.hasTrack) {
      set({ status: "error", error: "Load a song first.", statusText: "Need a track." });
      return;
    }
    if (job !== "remix" && !deckB.hasTrack) {
      set({ status: "error", error: "Load both songs first.", statusText: "Need song A and song B." });
      return;
    }
    studioEngine.stop();
    djEngine.invalidateRender();
    set({ hasOutput: false });
    try {
      if (job === "stems") {
        const songA = sourceFiles.a;
        const songB = sourceFiles.b;
        if (!songA || !songB) throw new Error("Reload both original songs before automatic stem separation.");
        separationController = new AbortController();
        set({ status: "planning", statusText: "Separating vocals and instrumentals with Demucs…", error: null, cue: null });
        const { instrumentalA, vocalsB } = await makeAutomaticMashupStems(songA, songB, separationController.signal);
        separationController = null;
        if (currentRevision !== revision) return;
        const originalBpmA = deckA.bpm;
        const originalBpmB = deckB.bpm;
        djEngine.setBuffer("a", instrumentalA, `${deckA.name} · instrumental`, originalBpmA, false);
        djEngine.setBuffer("b", vocalsB, `${deckB.name} · vocals`, originalBpmB, false);
        deckA = { ...djEngine.deck("a") };
        deckB = { ...djEngine.deck("b") };
        set({ ...snapshot(), status: "planning", statusText: "Stems ready. Building the mashup…" });
      }

      const verb =
        job === "remix" ? "Producing remix" : job === "both" ? "Producing mash + remix" : job === "stems" ? "Producing vocal mashup" : "Producing mashup";
      set({ status: "planning", statusText: `${verb}…`, error: null, cue: null });
      const bufA = djEngine.rawBuffer("a");
      const bufB = job === "remix" ? null : djEngine.rawBuffer("b");
      const anA = bufA ? analyzeTrack(bufA, deckA.bpm, deckA.offset) : null;
      const anB = bufB ? analyzeTrack(bufB, deckB.bpm, deckB.offset) : null;
      const compact = (xs: number[]) =>
        xs
          .slice(0, 24)
          .map((x) => x.toFixed(2))
          .join(",");
      const input = {
        job,
        nameA: deckA.name.slice(0, 80),
        nameB: job === "remix" ? "" : deckB.name.slice(0, 80),
        bpmA: deckA.bpm,
        bpmB: job === "remix" ? deckA.bpm : deckB.bpm,
        durationA: deckA.duration,
        durationB: job === "remix" ? 0 : deckB.duration,
        prompt: prompt.trim(),
        energyA: anA ? compact(anA.energy) : "",
        energyB: anB ? compact(anB.energy) : "",
        peakASec: anA?.peakSec ?? 0,
        peakBSec: anB?.peakSec ?? 0,
        dropBarA: anA?.dropBar ?? 16,
        dropBarB: anB?.dropBar ?? 16,
      };
      let plan: MixPlan = fallbackPlan(input);
      try {
        const res = await planMix({ data: input });
        if (res.ok) plan = res.plan;
      } catch {
        /* local plan */
      }
      if (currentRevision !== revision) return;
      set({
        plan,
        cue: plan.cue,
        status: "rendering",
        statusText: "Rendering audio…",
      });
      await djEngine.runPlan(plan);
      if (currentRevision !== revision) return;
      set({ ...snapshot(), hasOutput: true, status: "mixing", statusText: "Ready. Play or download your WAV." });
      void saveMashCut({
        data: {
          nameA: deckA.name,
          nameB: job === "remix" ? "remix" : job === "both" ? `${deckB.name} · remix mash` : deckB.name,
          bpmA: deckA.bpm,
          bpmB: job === "remix" ? plan.targetBpm : deckB.bpm,
          cue: plan.cue,
        },
      })
        .then(() => listMashCuts())
        .then((recents) => set({ recents }))
        .catch(() => {
          /* signed out */
        });
    } catch (err) {
      separationController = null;
      if (currentRevision !== revision) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      set({ status: "error", error: err instanceof Error ? err.message : "Could not render the mix.", statusText: "Rendering failed. Check your audio and try again.", hasOutput: false, ...snapshot() });
    }
  },

  playMash: async () => {
    if (["loading", "planning", "rendering"].includes(get().status)) return;
    const plan = get().plan;
    if (plan && get().hasOutput) {
      studioEngine.stop();
      await djEngine.runPlan(plan);
      set({ status: "mixing", statusText: plan.cue, ...snapshot() });
      return;
    }
    await get().dropMix();
  },

  stopMix: () => {
    revision++;
    cancelSeparation();
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
