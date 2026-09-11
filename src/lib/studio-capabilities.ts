import { createServerFn } from "@tanstack/react-start";
import {
  aceStepBackend,
  aceStepConfigured,
  replicateModelId,
} from "@/lib/ace-step";
import { capabilityCopy } from "@/lib/studio-errors";

export type StudioCapabilities = {
  aceStep: boolean;
  xai: boolean;
  owner: boolean;
  model: string;
  backend: "host" | "replicate" | "none";
  engineLabel: string;
  setupHint: string | null;
};

async function sessionIsOwner(): Promise<boolean> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { auth } = await import("@/lib/auth/server");
    const { isAdminEmail } = await import("@/lib/auth/admin");
    const request = getRequest();
    if (!request) return false;
    const session = await auth.api.getSession({ headers: request.headers });
    return isAdminEmail(session?.user?.email);
  } catch {
    return false;
  }
}

export const getStudioCapabilities = createServerFn({ method: "GET" }).handler(
  async (): Promise<StudioCapabilities> => {
    const backend = aceStepBackend();
    const aceStep = aceStepConfigured();
    const xai = Boolean(process.env.XAI_API_KEY?.trim());
    const owner = await sessionIsOwner();
    const model =
      backend === "replicate"
        ? replicateModelId()
        : process.env.ACE_STEP_MODEL?.trim() || "acestep/ACE-Step-v1.5";
    const copy = capabilityCopy({ aceStep, owner, backend, model });
    return {
      aceStep,
      xai,
      owner,
      model,
      backend,
      engineLabel: copy.engineLabel,
      setupHint: copy.setupHint,
    };
  },
);
