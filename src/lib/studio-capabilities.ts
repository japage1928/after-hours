import { createServerFn } from "@tanstack/react-start";
import { aceStepConfigured } from "@/lib/ace-step";

export type StudioCapabilities = {
  aceStep: boolean;
  xai: boolean;
  model: string;
  engineLabel: string;
};

export const getStudioCapabilities = createServerFn({ method: "GET" }).handler(
  async (): Promise<StudioCapabilities> => {
    const aceStep = aceStepConfigured();
    const xai = Boolean(process.env.XAI_API_KEY?.trim());
    const model =
      process.env.ACE_STEP_MODEL?.trim() || "acestep/ACE-Step-v1.5";
    const engineLabel = aceStep
      ? xai
        ? `AI generation powered by ACE-Step (${model}); prompts via xAI`
        : `AI generation powered by ACE-Step (${model})`
      : "ACE-Step is not configured — Generate and AI remix need ACE_STEP_BASE_URL. Mashup and a labeled local remix preview still work in this browser.";
    return { aceStep, xai, model, engineLabel };
  },
);
