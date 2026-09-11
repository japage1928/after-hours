/**
 * Resolve the Postgres connection string for deploy / local.
 *
 * Accepts both our `DATABASE_URL` and the names the Supabase ↔ Vercel
 * Marketplace integration injects (`POSTGRES_URL`, etc.), so either manual
 * env setup or the one-click integration works without code changes.
 */
export function resolveDatabaseUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | undefined {
  const keys = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
  ] as const;

  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function isDatabaseConfigured(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(resolveDatabaseUrl(env));
}
