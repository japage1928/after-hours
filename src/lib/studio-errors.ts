const SETUP_HINT =
  "Add REPLICATE_API_TOKEN on Vercel Production (replicate.com API token + a payment method). You do not need ACE_STEP_BASE_URL or Demucs. Without the token, Generate cannot run — we never fake a song.";

const VIDEO_SETUP_HINT =
  "Add XAI_API_KEY on this deploy (same key as music prompt translation). Video is Grok Imagine — there is no fake clip.";

export function capabilityCopy(opts: {
  aceStep: boolean;
  owner: boolean;
  backend: "replicate" | "host" | "none";
  model?: string;
}): { engineLabel: string; setupHint: string | null } {
  if (opts.aceStep) {
    const engineLabel =
      opts.backend === "host"
        ? "AI generation powered by ACE-Step (self-hosted)"
        : "AI generation powered by ACE-Step (via Replicate)";
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

export function videoCapabilityCopy(opts: {
  video: boolean;
  owner: boolean;
  model?: string;
}): { engineLabel: string; setupHint: string | null } {
  if (opts.video) {
    return {
      engineLabel:
        "Prompt + QA by Grok / xAI; video by Grok Imagine (grok-imagine-video-1.5)",
      setupHint: null,
    };
  }
  if (opts.owner) {
    return {
      engineLabel: "Video is not configured on this deployment",
      setupHint: VIDEO_SETUP_HINT,
    };
  }
  return {
    engineLabel: "AI video is temporarily unavailable",
    setupHint: null,
  };
}

export function humanizeStudioError(
  raw: string,
  opts?: { owner?: boolean },
): string {
  const owner = opts?.owner ?? false;
  const t = raw.toLowerCase();
  if (t.includes("quota") || t.includes("out of remixes") || t.includes("upgrade") || t.includes("free tier includes")) {
    return "You're out of AI jobs for this period. Pick a plan below to keep generating.";
  }
  if (t.includes("sign in") || t.includes("not signed")) {
    return "Sign in to generate AI songs. Your first two each month are free.";
  }
  if (t.includes("not configured") || t.includes("ace-step isn’t configured") || t.includes("ace-step isn't configured")) {
    if (owner) {
      return "Generate needs ACE-Step via Replicate. Add REPLICATE_API_TOKEN on Vercel Production (no ACE_STEP_BASE_URL required), then retry.";
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
  if (
    (/\b(502|503|504)\b/.test(t) || t.includes("failed (")) &&
    !t.includes("imagine") &&
    !t.includes("video")
  ) {
    return owner
      ? raw
      : "The music model is down or busy. Try again in a minute.";
  }
  if (
    t.includes("video needs xai") ||
    t.includes("xai_api_key") ||
    (t.includes("video") && t.includes("not configured"))
  ) {
    if (owner) {
      return "Video needs XAI_API_KEY (Grok Imagine). Add the key on this deploy, then retry.";
    }
    return "AI video is temporarily unavailable. Generate and mashup still work.";
  }
  if (t.includes("xai") || t.includes("grok")) {
    if (t.includes("video") || t.includes("clip") || t.includes("imagine")) {
      return raw;
    }
    return "Style helper is optional. Generate still runs from your prompt.";
  }
  return raw;
}
