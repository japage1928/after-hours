import { create } from "zustand";
import { decodeAceStepAudio } from "@/lib/ace-step";
import { qaAudioBuffer } from "@/lib/ace-step-qa";
import {
  audioDecodeErrorMessage,
  classifyAudioFile,
  displayTrackName,
} from "@/lib/audio-file";
import {
  grooveLabel,
  remixBpmForStyle,
  renderAiBeat,
  syntheticPeaks,
  type GrooveStyle,
} from "@/lib/ai-beat";
import { detectBpm, waveformPeaks } from "@/lib/bpm";
import {
  bounceMix,
  downloadAceStepMp3,
  downloadWav,
  mashupMixRecipe,
  remixMixRecipe,
  MAX_UPLOAD_BYTES,
} from "@/lib/bounce";
import { interpretGenerateIntent } from "@/lib/generate-intent";
import { interpretRemixIntent, runAceStepJob } from "@/lib/remix-intent";
import { getStudioCapabilities } from "@/lib/studio-capabilities";
import { humanizeStudioError } from "@/lib/studio-errors";
import { studioPlayer } from "@/lib/studio-player";
import type { BoothMode } from "@/lib/booth-mode";

export type StudioStatus =
  | "idle"
  | "loading"
  | "generating"
  | "ready"
  | "error";

export type LoadedTrack = {
  name: string;
  buffer: AudioBuffer;
  bpm: number;
  duration: number;
  peaks: number[];
};

export type StudioResult = {
  title: string;
  mode: BoothMode;
  buffer: AudioBuffer;
  peaks: number[];
  duration: number;
  bpm?: number;
  engine: "ace-step" | "local-mix";
  summary: string;
  /** Original ACE-Step payload for lossless-ish download. */
  aceStepBase64?: string;
  aceStepMime?: string;
};

type StudioState = {
  ready: boolean;
  status: StudioStatus;
  statusText: string;
  error: string | null;
  needsUpgrade: boolean;
  capabilities: { aceStep: boolean; xai: boolean; engineLabel: string } | null;
  grooveStyle: GrooveStyle;
  prompt: string;
  lyrics: string;
  instrumental: boolean;
  durationSec: number;
  playing: boolean;
  playhead: number;
  sourceA: LoadedTrack | null;
  sourceB: LoadedTrack | null;
  result: StudioResult | null;
  hydrate: () => Promise<void>;
  setPrompt: (v: string) => void;
  setLyrics: (v: string) => void;
  setInstrumental: (v: boolean) => void;
  setDurationSec: (v: number) => void;
  setGrooveStyle: (v: GrooveStyle) => void;
  loadSource: (slot: "a" | "b", file: File) => Promise<void>;
  clearSource: (slot: "a" | "b") => void;
  generate: () => Promise<void>;
  remix: (opts?: { localPreview?: boolean }) => Promise<void>;
  mashup: () => Promise<void>;
  playResult: () => Promise<void>;
  pauseResult: () => void;
  stopResult: () => void;
  downloadResult: () => void;
};

let tickBound = false;
let jobGen = 0;

async function decodeAceToBuffer(
  result: { audioBase64: string; mime: string; bpm?: number; durationSec?: number },
): Promise<AudioBuffer> {
  await studioPlayer.ensure();
  const audioCtx = new AudioContext({ sampleRate: studioPlayer.sampleRate() });
  try {
    return await decodeAceStepAudio(audioCtx, result);
  } finally {
    await audioCtx.close().catch(() => undefined);
  }
}

function longLocalBed(
  style: GrooveStyle,
  bpm: number,
  durationSec: number,
): AudioBuffer {
  const sr = studioPlayer.sampleRate();
  const beat = 60 / Math.max(70, bpm);
  const bars = Math.min(64, Math.max(16, Math.round(durationSec / (4 * beat))));
  const frames = Math.max(1, Math.ceil(bars * 4 * beat * sr));
  const offline = new OfflineAudioContext(2, frames, sr);
  return renderAiBeat(offline, { bpm, style, bars });
}

export const useStudioBooth = create<StudioState>((set, get) => ({
  ready: false,
  status: "idle",
  statusText: "Pick a mode and start.",
  error: null,
  needsUpgrade: false,
  capabilities: null,
  grooveStyle: "pop",
  prompt: "",
  lyrics: "",
  instrumental: false,
  durationSec: 60,
  playing: false,
  playhead: 0,
  sourceA: null,
  sourceB: null,
  result: null,

  setPrompt: (prompt) => set({ prompt }),
  setLyrics: (lyrics) => set({ lyrics }),
  setInstrumental: (instrumental) => set({ instrumental }),
  setDurationSec: (durationSec) => set({ durationSec }),
  setGrooveStyle: (grooveStyle) => set({ grooveStyle }),

  hydrate: async () => {
    if (!tickBound) {
      tickBound = true;
      studioPlayer.onTick((t) => {
        set({ playing: t.playing, playhead: t.current });
      });
    }
    await studioPlayer.ensure();
    if (!get().capabilities) {
      try {
        const caps = await getStudioCapabilities();
        set({
          capabilities: {
            aceStep: caps.aceStep,
            xai: caps.xai,
            engineLabel: caps.engineLabel,
          },
        });
      } catch {
        set({
          capabilities: {
            aceStep: false,
            xai: false,
            engineLabel: "Could not read generation status.",
          },
        });
      }
    }
    set({ ready: true });
  },

  loadSource: async (slot, file) => {
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
    if (file.size > MAX_UPLOAD_BYTES) {
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
      statusText: `Reading ${label}…`,
      error: null,
    });
    try {
      studioPlayer.stop();
      const buffer = await studioPlayer.decodeFile(file);
      const guess = detectBpm(buffer);
      const track: LoadedTrack = {
        name: label,
        buffer,
        bpm: guess.bpm,
        duration: buffer.duration,
        peaks: guess.peaks,
      };
      set({
        status: "idle",
        statusText: `${label} · ${guess.bpm} BPM · ${Math.round(buffer.duration)}s`,
        error: null,
        result: null,
        ...(slot === "a" ? { sourceA: track } : { sourceB: track }),
      });
    } catch (err) {
      set({
        status: "error",
        error: audioDecodeErrorMessage(err),
        statusText: "Could not read the track.",
      });
    }
  },

  clearSource: (slot) => {
    set(slot === "a" ? { sourceA: null, result: null } : { sourceB: null, result: null });
  },

  generate: async () => {
    const { prompt, grooveStyle, lyrics, instrumental, durationSec } = get();
    const brief = prompt.trim();
    if (brief.length < 2) {
      set({
        status: "error",
        error: "Describe the song first — a prompt is required.",
        statusText: "Need a prompt.",
      });
      return;
    }
    const gen = ++jobGen;
    studioPlayer.stop();
    set({
      status: "generating",
      statusText: "Writing the production brief…",
      error: null,
      needsUpgrade: false,
      result: null,
    });
    try {
      const intent = await interpretGenerateIntent({
        data: {
          prompt: brief,
          style: grooveStyle,
          lyrics,
          durationSec,
          instrumental,
        },
      });
      if (gen !== jobGen) return;
      if (!intent.ok && intent.needsUpgrade) {
        set({
          status: "idle",
          needsUpgrade: true,
          error: humanizeStudioError(intent.error),
          statusText: "AI generation needs a plan.",
        });
        return;
      }
      if (!intent.aceStepReady) {
        set({
          status: "error",
          error: humanizeStudioError("ACE-Step is not configured on this deploy."),
          statusText: "ACE-Step isn’t configured.",
        });
        return;
      }
      set({
        statusText: intent.usedAi
          ? `Brief ready — ${intent.job.summary}`
          : `Local brief — ${intent.job.summary}`,
      });
      set({ statusText: "Generating with ACE-Step…" });
      const run = await runAceStepJob({
        data: {
          job: intent.job,
          brief,
          genreLabel: grooveLabel(grooveStyle),
        },
      });
      if (gen !== jobGen) return;
      if (!run.ok) {
        set({
          status: "error",
          error: humanizeStudioError(run.error),
          statusText: "Generation failed.",
        });
        return;
      }
      const buffer = await decodeAceToBuffer(run.result);
      const bufferQa = qaAudioBuffer(buffer, {
        minDurationSec: 8,
        maxDurationSec: 240,
      });
      if (!bufferQa.ok) {
        set({
          status: "error",
          error: humanizeStudioError(
            `QA rejected audio (${bufferQa.reasons[0] ?? "failed"}).`,
          ),
          statusText: "Quality check failed.",
        });
        return;
      }
      studioPlayer.load(buffer);
      set({
        status: "ready",
        statusText: "Ready — play or download.",
        error: null,
        result: {
          title: intent.job.summary.slice(0, 80) || "Generated song",
          mode: "generate",
          buffer,
          peaks: waveformPeaks(buffer),
          duration: buffer.duration,
          bpm: run.result.bpm ?? intent.job.bpm,
          engine: "ace-step",
          summary: intent.job.summary,
          aceStepBase64: run.result.audioBase64,
          aceStepMime: run.result.mime,
        },
      });
    } catch (err) {
      if (gen !== jobGen) return;
      set({
        status: "error",
        error: humanizeStudioError(
          err instanceof Error ? err.message : "Generation failed.",
        ),
        statusText: "Generation failed.",
      });
    }
  },

  remix: async (opts) => {
    const { sourceA, grooveStyle, prompt } = get();
    if (!sourceA) {
      set({
        status: "error",
        error: "Load a song you own first.",
        statusText: "Need a song.",
      });
      return;
    }
    const gen = ++jobGen;
    studioPlayer.stop();
    const brief =
      prompt.trim() ||
      `Rebuild this song as ${grooveLabel(grooveStyle)} — keep the vocal character, new drums and bass.`;
    set({
      status: "generating",
      statusText: "Writing the remix brief…",
      error: null,
      needsUpgrade: false,
      result: null,
    });

    const finishMix = async (
      bed: AudioBuffer,
      bedBpm: number,
      engine: StudioResult["engine"],
      summary: string,
      ace?: { audioBase64: string; mime: string },
    ) => {
      set({ statusText: "Mixing your song onto the new beat…" });
      const recipe = remixMixRecipe({
        originalBpm: sourceA.bpm,
        bedBpm,
      });
      const mixed = await bounceMix({
        bed,
        overlay: sourceA.buffer,
        recipe,
        sampleRate: studioPlayer.sampleRate(),
      });
      studioPlayer.load(mixed);
      set({
        status: "ready",
        statusText: "Ready — play or download.",
        error: null,
        result: {
          title: `${sourceA.name} · ${grooveLabel(grooveStyle)} remix`,
          mode: "remix",
          buffer: mixed,
          peaks: waveformPeaks(mixed),
          duration: mixed.duration,
          bpm: bedBpm,
          engine,
          summary,
          aceStepBase64: ace?.audioBase64,
          aceStepMime: ace?.mime,
        },
      });
    };

    try {
      if (opts?.localPreview) {
        const bpm = remixBpmForStyle(sourceA.bpm, grooveStyle);
        const bed = longLocalBed(
          grooveStyle,
          bpm,
          Math.max(32, sourceA.duration),
        );
        if (gen !== jobGen) return;
        await finishMix(
          bed,
          bpm,
          "local-mix",
          `Local ${grooveLabel(grooveStyle)} drum-bed preview — not ACE-Step.`,
        );
        return;
      }

      const intent = await interpretRemixIntent({
        data: {
          brief,
          genre: grooveStyle,
          songName: sourceA.name,
          songBpm: sourceA.bpm,
          songDurationSec: sourceA.duration,
          instrumental: true,
        },
      });
      if (gen !== jobGen) return;
      if (!intent.ok && intent.needsUpgrade) {
        set({
          status: "idle",
          needsUpgrade: true,
          error: humanizeStudioError(intent.error),
          statusText: "AI remix needs a plan.",
        });
        return;
      }
      if (!intent.aceStepReady) {
        set({
          status: "error",
          error: humanizeStudioError("ACE-Step is not configured on this deploy."),
          statusText: "ACE-Step isn’t configured.",
        });
        return;
      }

      set({
        statusText: intent.usedAi
          ? `Brief ready — ${intent.job.summary}`
          : `Local brief — ${intent.job.summary}`,
      });
      set({ statusText: "ACE-Step generating the new beat…" });
      const run = await runAceStepJob({
        data: {
          job: intent.job,
          brief,
          genreLabel: grooveLabel(grooveStyle),
        },
      });
      if (gen !== jobGen) return;
      if (!run.ok) {
        set({
          status: "error",
          error: humanizeStudioError(run.error),
          statusText: "Remix generation failed.",
        });
        return;
      }
      const bed = await decodeAceToBuffer(run.result);
      const bufferQa = qaAudioBuffer(bed, { minDurationSec: 8, maxDurationSec: 240 });
      if (!bufferQa.ok) {
        set({
          status: "error",
          error: humanizeStudioError(
            `QA rejected audio (${bufferQa.reasons[0] ?? "failed"}).`,
          ),
          statusText: "Quality check failed.",
        });
        return;
      }
      const bpm = Math.round(run.result.bpm || intent.job.bpm || sourceA.bpm);
      await finishMix(bed, bpm, "ace-step", intent.job.summary, {
        audioBase64: run.result.audioBase64,
        mime: run.result.mime,
      });
    } catch (err) {
      if (gen !== jobGen) return;
      set({
        status: "error",
        error: humanizeStudioError(
          err instanceof Error ? err.message : "Remix failed.",
        ),
        statusText: "Remix failed.",
      });
    }
  },

  mashup: async () => {
    const { sourceA, sourceB } = get();
    if (!sourceA || !sourceB) {
      set({
        status: "error",
        error: "Load beats and a lyrics/vocals track you own.",
        statusText: "Need two tracks.",
      });
      return;
    }
    const gen = ++jobGen;
    studioPlayer.stop();
    set({
      status: "generating",
      statusText: "Beat-matching beats × lyrics…",
      error: null,
      needsUpgrade: false,
      result: null,
    });
    try {
      const recipe = mashupMixRecipe({
        beatsBpm: sourceA.bpm,
        lyricsBpm: sourceB.bpm,
      });
      const mixed = await bounceMix({
        bed: sourceA.buffer,
        overlay: sourceB.buffer,
        recipe,
        sampleRate: studioPlayer.sampleRate(),
      });
      if (gen !== jobGen) return;
      studioPlayer.load(mixed);
      set({
        status: "ready",
        statusText: "Ready — play or download.",
        error: null,
        result: {
          title: `${sourceA.name} × ${sourceB.name}`,
          mode: "mashup",
          buffer: mixed,
          peaks: waveformPeaks(mixed),
          duration: mixed.duration,
          bpm: sourceA.bpm,
          engine: "local-mix",
          summary: "Beats × lyrics mashup (beat-matched, EQ-split, bounced).",
        },
      });
    } catch (err) {
      if (gen !== jobGen) return;
      set({
        status: "error",
        error: humanizeStudioError(
          err instanceof Error ? err.message : "Mashup failed.",
        ),
        statusText: "Mashup failed.",
      });
    }
  },

  playResult: async () => {
    if (!get().result) return;
    await studioPlayer.play();
    set({ playing: true });
  },

  pauseResult: () => {
    studioPlayer.pause();
    set({ playing: false, playhead: studioPlayer.currentTime() });
  },

  stopResult: () => {
    studioPlayer.stop();
    set({ playing: false, playhead: 0 });
  },

  downloadResult: () => {
    const result = get().result;
    if (!result) return;
    const slug = result.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "after-hours";
    if (result.mode === "generate" && result.aceStepBase64) {
      downloadAceStepMp3(
        result.aceStepBase64,
        result.aceStepMime || "audio/mpeg",
        slug,
      );
      return;
    }
    downloadWav(result.buffer, slug);
  },
}));
