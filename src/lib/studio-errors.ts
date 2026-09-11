const SETUP_HINT =
  "Set REPLICATE_API_TOKEN (or ACE_STEP_BASE_URL) on this deployment. Without it, Generate cannot run — we never fake a song.";

const DEFAULT_MODEL = "fishaudio/ace-step-1.5";

export function capabilityCopy(opts: {
  aceStep: boolean;
  owner: boolean;
  backend: "replicate" | "host" | "none";
  model?: string;
}): { engineLabel: string; setupHint: string | null } {
  if (opts.aceStep) {
    const model = opts.model?.trim() || DEFAULT_MODEL;
    const engineLabel =
      opts.backend === "host"
        ? "ACE-Step on your GPU host"
        : `ACE-Step via Replicate (${model})`;
    return { engineLabel, setupHint: null };
  }
  if (opts.owner) {
    return {
      engineLabel: "AI studio is not configured on this deployment",
      setupHint: SETUP_HINT,
    };
  }
  return {
    engineLabel: "AI studio is temporarily unavailable",
    setupHint: null,
  };
}

/** @deprecated use capabilityCopy — kept for call sites that only need the label. */
export function engineLabel(opts: {
  aceStep: boolean;
  xai?: boolean;
  owner?: boolean;
  backend?: "replicate" | "host" | "none";
  model?: string;
}): string {
  return capabilityCopy({
    aceStep: opts.aceStep,
    owner: Boolean(opts.owner),
    backend: opts.backend ?? (opts.aceStep ? "replicate" : "none"),
    model: opts.model,
  }).engineLabel;
}

export function humanizeStudioError(
  raw: string,
  opts?: { owner?: boolean },
): string {
  const owner = opts?.owner ?? false;
  const t = raw.toLowerCase();
  if (t.includes("quota") || t.includes("out of remixes") || t.includes("upgrade") || t.includes("free tier includes")) {
    return "You're out of AI songs for this period. Pick a plan below to keep generating.";
  }
  if (t.includes("sign in") || t.includes("not signed")) {
    return "Sign in to generate AI songs. Your first two each month are free.";
  }
  if (t.includes("not configured") || t.includes("ace-step isn’t configured") || t.includes("ace-step isn't configured")) {
    if (owner) {
      return "Generate needs ACE-Step. Set REPLICATE_API_TOKEN (or ACE_STEP_BASE_URL) in Vercel env, then retry.";
    }
    return "AI studio is temporarily unavailable. You can still mashup two tracks on-device.";
  }
  if (
    t.includes("replicate") &&
    (t.includes("auth") ||
      t.includes("token") ||
      t.includes("unauthorized") ||
      t.includes("rejected"))
  ) {
    return owner
      ? "Replicate rejected the API token. Check REPLICATE_API_TOKEN and billing on replicate.com."
      : "AI studio is temporarily unavailable. Please try again later.";
  }
  if (t.includes("timed out") || t.includes("timeout")) {
    return "The model took too long. Try a shorter duration or retry in a minute.";
  }
  if (/\b(502|503|504)\b/.test(t) || t.includes("failed (")) {
    return owner
      ? raw
      : "The music model is down or busy. Try again in a minute.";
  }
  if (t.includes("xai") || t.includes("grok")) {
    return "Style helper is optional. Generate still runs from your prompt.";
  }
  return raw;
}
