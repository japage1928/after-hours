import { create } from "zustand";
import {
  DEFAULT_VIDEO_ASPECT,
  DEFAULT_VIDEO_DURATION_SEC,
  type VideoAspect,
} from "@/lib/grok-video";
import { getStudioCapabilities } from "@/lib/studio-capabilities";
import { humanizeStudioError } from "@/lib/studio-errors";
import { bumpUsageMeter } from "@/lib/usage-events";
import { interpretVideoIntent, runGrokVideoJob } from "@/lib/video-intent";
import { VIDEO_STUDIO } from "@/lib/video-booth";
import { saveVideoClip } from "@/lib/track-library";

export type VideoStatus = "idle" | "generating" | "ready" | "error";

export type VideoResult = {
  title: string;
  summary: string;
  prompt: string;
  duration: number;
  aspectRatio: VideoAspect;
  mime: string;
  videoBase64: string;
  objectUrl: string;
  engine: "grok-imagine";
};

type VideoState = {
  ready: boolean;
  status: VideoStatus;
  statusText: string;
  error: string | null;
  needsUpgrade: boolean;
  capabilities: {
    video: boolean;
    xai: boolean;
    owner: boolean;
    engineLabel: string;
    setupHint: string | null;
  } | null;
  prompt: string;
  durationSec: number;
  aspectRatio: VideoAspect;
  result: VideoResult | null;
  lastLibrarySave: { id: string; title: string } | null;
  hydrate: () => Promise<void>;
  setPrompt: (v: string) => void;
  setDurationSec: (v: number) => void;
  setAspectRatio: (v: VideoAspect) => void;
  generate: () => Promise<void>;
  downloadResult: () => void;
};

let jobGen = 0;
let objectUrl: string | null = null;

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function blobFromBase64(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: mime || "video/mp4" });
}

function humanizeForState(raw: string): string {
  return humanizeStudioError(raw, {
    owner: Boolean(useVideoStudio.getState().capabilities?.owner),
  });
}

export const useVideoStudio = create<VideoState>((set, get) => ({
  ready: false,
  status: "idle",
  statusText: "Describe a clip to start.",
  error: null,
  needsUpgrade: false,
  capabilities: null,
  prompt: VIDEO_STUDIO.defaultPrompt,
  durationSec: DEFAULT_VIDEO_DURATION_SEC,
  aspectRatio: DEFAULT_VIDEO_ASPECT,
  result: null,
  lastLibrarySave: null,

  setPrompt: (prompt) => set({ prompt }),
  setDurationSec: (durationSec) => set({ durationSec }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),

  hydrate: async () => {
    if (!get().capabilities) {
      try {
        const caps = await getStudioCapabilities();
        set({
          capabilities: {
            video: caps.video,
            xai: caps.xai,
            owner: caps.owner,
            engineLabel: caps.videoEngineLabel,
            setupHint: caps.videoSetupHint,
          },
        });
      } catch {
        set({
          capabilities: {
            video: false,
            xai: false,
            owner: false,
            engineLabel: "Could not read video status.",
            setupHint: null,
          },
        });
      }
    }
    if (!get().prompt.trim()) {
      set({ prompt: VIDEO_STUDIO.defaultPrompt });
    }
    set({ ready: true });
  },

  generate: async () => {
    const { prompt, durationSec, aspectRatio } = get();
    const brief = prompt.trim();
    if (brief.length < 2) {
      set({
        status: "error",
        error: "Describe the clip first — a prompt is required.",
        statusText: "Need a prompt.",
      });
      return;
    }
    const gen = ++jobGen;
    revokeObjectUrl();
    set({
      status: "generating",
      statusText: "Grok is writing the video prompt…",
      error: null,
      needsUpgrade: false,
      result: null,
      lastLibrarySave: null,
    });
    try {
      const intent = await interpretVideoIntent({
        data: { prompt: brief, durationSec, aspectRatio },
      });
      if (gen !== jobGen) return;
      if (!intent.ok && intent.needsUpgrade) {
        set({
          status: "idle",
          needsUpgrade: true,
          error: humanizeForState(intent.error),
          statusText: "AI video needs a plan.",
        });
        return;
      }
      if (!intent.videoReady) {
        set({
          status: "error",
          error: humanizeForState("Video needs XAI_API_KEY on this deploy."),
          statusText: "Grok Imagine isn’t configured.",
        });
        return;
      }
      set({
        statusText: intent.usedAi
          ? `Prompt ready — ${intent.job.summary}`
          : `Local prompt — ${intent.job.summary}`,
      });
      set({
        statusText: "Grok Imagine is rendering — Grok will QA before we show it…",
      });
      const run = await runGrokVideoJob({
        data: { job: intent.job, brief },
      });
      if (gen !== jobGen) return;
      if (!run.ok) {
        set({
          status: "error",
          error: humanizeForState(run.error),
          statusText: "Video failed QA or render.",
        });
        return;
      }
      const mime = run.result.mime || "video/mp4";
      const blob = blobFromBase64(run.result.videoBase64, mime);
      const url = URL.createObjectURL(blob);
      objectUrl = url;
      const result: VideoResult = {
        title: intent.job.summary.slice(0, 80) || "After Hours clip",
        summary: intent.job.summary,
        prompt: brief,
        duration: run.result.durationSec,
        aspectRatio,
        mime,
        videoBase64: run.result.videoBase64,
        objectUrl: url,
        engine: "grok-imagine",
      };
      set({
        status: "ready",
        statusText: "Ready — play or download. Saved to your library.",
        error: null,
        result,
      });
      bumpUsageMeter();
      try {
        const saved = await saveVideoClip({
          title: result.title,
          duration: result.duration,
          summary: result.summary,
          prompt: brief,
          mime,
          base64: run.result.videoBase64,
        });
        set({ lastLibrarySave: { id: saved.id, title: saved.title } });
      } catch {
        /* IndexedDB is best-effort — play/download still work. */
      }
    } catch (err) {
      if (gen !== jobGen) return;
      set({
        status: "error",
        error: humanizeForState(
          err instanceof Error ? err.message : "Video generation failed.",
        ),
        statusText: "Video generation failed.",
      });
    }
  },

  downloadResult: () => {
    const result = get().result;
    if (!result) return;
    const slug =
      result.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") ||
      "after-hours-clip";
    const blob = blobFromBase64(result.videoBase64, result.mime);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.mp4`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
  },
}));
