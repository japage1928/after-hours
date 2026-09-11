/**
 * The upstream identity providers this app offers for sign-in (via the broker).
 *
 * Source of truth for BOTH the server (`server.ts`, one `genericOAuth` provider
 * per entry) and the client (`client.ts` / sign-in buttons). Kept in its own
 * dependency-free module so the client can import it without pulling the
 * server-only Better Auth instance (and `pg`) into the browser bundle.
 *
 * Each app federates to the shared **auth broker** (`GROK_AUTH_ISSUER`), which
 * holds the real Google / Facebook / X secrets. The app never sees them — it
 * only knows its own per-app client id/secret and which upstream to ask the
 * broker for (`idp`).
 *
 * Optional direct Better Auth social (when `GOOGLE_*` / `FACEBOOK_*` /
 * `TWITTER_*` env vars are set) is wired in `server.ts` and listed on the
 * client via `VITE_NATIVE_SOCIAL` (comma list: `google,facebook,twitter`).
 *
 * Better Auth's id for X is still `twitter`.
 */
export type GrokProvider = {
  /** This app's local provider id; also the callback path segment. */
  providerId: string;
  /** Upstream hint the broker forwards to (Better Auth social id). */
  idp: string;
  /** Human label for the sign-in button. */
  label: string;
};

export const GROK_PROVIDERS: readonly GrokProvider[] = [
  { providerId: "grok-google", idp: "google", label: "Google" },
  { providerId: "grok-facebook", idp: "facebook", label: "Facebook" },
  { providerId: "grok-x", idp: "twitter", label: "X" },
];

/** Direct Better Auth social provider ids (not broker). */
export type NativeSocialId = "google" | "facebook" | "twitter";

export type NativeSocialProvider = {
  id: NativeSocialId;
  label: string;
};

/**
 * Which direct social providers are configured on the server.
 * Safe to call from server code only (reads process.env).
 */
export function nativeSocialProvidersFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): NativeSocialProvider[] {
  const out: NativeSocialProvider[] = [];
  if (env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()) {
    out.push({ id: "google", label: "Google" });
  }
  if (env.FACEBOOK_CLIENT_ID?.trim() && env.FACEBOOK_CLIENT_SECRET?.trim()) {
    out.push({ id: "facebook", label: "Facebook" });
  }
  if (env.TWITTER_CLIENT_ID?.trim() && env.TWITTER_CLIENT_SECRET?.trim()) {
    out.push({ id: "twitter", label: "X" });
  }
  return out;
}

/**
 * Client-visible native social flags (set at build time).
 * Prefer broker buttons when unset — broker covers Google / Facebook / X.
 */
export function nativeSocialProvidersFromVite(): NativeSocialProvider[] {
  const raw = String(import.meta.env.VITE_NATIVE_SOCIAL ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: NativeSocialProvider[] = [];
  if (raw.includes("google")) out.push({ id: "google", label: "Google" });
  if (raw.includes("facebook")) out.push({ id: "facebook", label: "Facebook" });
  if (raw.includes("twitter") || raw.includes("x")) {
    out.push({ id: "twitter", label: "X" });
  }
  return out;
}
