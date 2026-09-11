/** Map raw model/quota/upload failures to copy a person can act on. */

export function humanizeStudioError(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "Something went wrong. Try again.";
  const lower = t.toLowerCase();

  if (
    lower.includes("replicate_api_token was rejected") ||
    (lower.includes("401") && lower.includes("replicate"))
  ) {
    return "Replicate rejected the API token. Check REPLICATE_API_TOKEN on this deploy.";
  }
  if (lower.includes("replicate billing") || lower.includes("payment method")) {
    return "Replicate billing needs a payment method. Add one at replicate.com, then try again.";
  }
  if (
    lower.includes("not configured") ||
    lower.includes("ace_step_base_url") ||
    (lower.includes("replicate_api_token") && lower.includes("set ")) ||
    lower.includes("ace-step is not configured")
  ) {
    return "AI music generation isn’t set up on this deploy. Add REPLICATE_API_TOKEN on Vercel Production (ACE-Step via Replicate). ACE_STEP_BASE_URL is an optional self-hosted override.";
  }
  if (
    lower.includes("free tier") ||
    lower.includes("limit reached") ||
    lower.includes("mix credit") ||
    lower.includes("weekly remix") ||
    lower.includes("buy a") ||
    lower.includes("start a plan")
  ) {
    return t;
  }
  if (lower.includes("40 mb") || lower.includes("too large") || lower.includes("too heavy")) {
    return "That file is too large. Keep each track under 40 MB.";
  }
  if (lower.includes("empty")) {
    return "That file is empty. Pick an M4A or MP3 you actually own.";
  }
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborted") ||
    lower.includes("abort")
  ) {
    return "The generator timed out. Try a shorter duration, or try again in a minute.";
  }
  if (lower.includes("ace-step failed (401)") || (lower.includes("401") && lower.includes("ace"))) {
    return "ACE-Step rejected the API key. Check ACE_STEP_API_KEY on this deploy.";
  }
  if (
    lower.includes("ace-step failed (5") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504")
  ) {
    return "The ACE-Step music model is down or busy. Try again in a few minutes.";
  }
  if (lower.includes("returned no audio") || lower.includes("no audio")) {
    return "The model returned no audio. Try a simpler prompt or another style.";
  }
  if (lower.includes("qa") && (lower.includes("silent") || lower.includes("short"))) {
    return "Generated audio failed quality checks (too short or too quiet). Try again.";
  }
  if (lower.includes("decode") || lower.includes("encodingerror")) {
    return t.includes("iPhone")
      ? t
      : "Couldn’t decode that track. On iPhone, pick an M4A or MP3 from Files or Voice Memos.";
  }
  if (lower.includes("ai is not available")) {
    return "The prompt translator (xAI) isn’t available. Generation can still run on ACE-Step with a local brief.";
  }
  return t.length > 280 ? `${t.slice(0, 277)}…` : t;
}

export function engineLabel(opts: {
  aceStep: boolean;
  xai: boolean;
  backend?: "host" | "replicate" | "none";
}): string {
  if (opts.aceStep) {
    const engine =
      opts.backend === "host"
        ? "AI generation powered by ACE-Step (self-hosted)"
        : "AI generation powered by ACE-Step via Replicate";
    return opts.xai ? `${engine}; prompts via xAI` : engine;
  }
  return "ACE-Step is not configured — add REPLICATE_API_TOKEN on Vercel (or ACE_STEP_BASE_URL).";
}
