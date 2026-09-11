import { createServerFn } from "@tanstack/react-start";
import {
  aceStepBackend,
  aceStepConfigured,
  replicateModelId,
} from "@/lib/ace-step";
import { engineLabel } from "@/lib/studio-errors";

export type StudioCapabilities = {
  aceStep: boolean;
  xai: boolean;
  model: string;
  backend: "host" | "replicate" | "none";
  engineLabel: string;
};

export const getStudioCapabilities = createServerFn({ method: "GET" }).handler(
  async (): Promise<StudioCapabilities> => {
    const backend = aceStepBackend();
    const aceStep = aceStepConfigured();
    const xai = Boolean(process.env.XAI_API_KEY?.trim());
    const model =
      backend === "replicate"
        ? replicateModelId()
        : process.env.ACE_STEP_MODEL?.trim() || "acestep/ACE-Step-v1.5";
    return {
      aceStep,
      xai,
      model,
      backend,
      engineLabel: engineLabel({ aceStep, xai, backend }),
    };
  },
);
