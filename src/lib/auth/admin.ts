/**
 * Admin allowlist — emails that can open `/admin`.
 * Override at deploy with comma-separated `ADMIN_EMAILS`.
 */
const DEFAULT_ADMIN_EMAILS = ["japage628@gmail.com"] as const;

function defaultEnv(): Record<string, string | undefined> {
  return typeof process !== "undefined" ? process.env : {};
}

export function adminEmails(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = defaultEnv(),
): string[] {
  const raw = env.ADMIN_EMAILS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  return [...DEFAULT_ADMIN_EMAILS];
}

export function isAdminEmail(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = defaultEnv(),
): boolean {
  if (!email) return false;
  return adminEmails(env).includes(email.trim().toLowerCase());
}
