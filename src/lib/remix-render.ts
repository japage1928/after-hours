import type { MixPlan } from "@/lib/dj-api";
import { renderRemix as renderLegacyRemix } from "./remix-render-legacy.ts";
import { renderProfessionalRemix } from "./remix-pro-render.ts";

type RenderInput = {
  sourceA: AudioBuffer;
  sourceB: AudioBuffer | null;
  bpmA: number;
  bpmB: number;
  offsetA: number;
  offsetB: number;
  plan: MixPlan;
  signal?: AbortSignal;
  vocalSemitones?: number;
};

export async function renderRemix(input: RenderInput): Promise<AudioBuffer> {
  if (input.plan.job === "remix") {
    return renderProfessionalRemix({
      source: input.sourceA,
      bpm: input.bpmA,
      offset: input.offsetA,
      requestedBpm: input.plan.targetBpm,
      signal: input.signal,
    });
  }
  return renderLegacyRemix(input);
}
