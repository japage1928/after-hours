#!/usr/bin/env node
/**
 * Deploy-time database migrator (node-postgres, `pg`).
 *
 * Runs during `npm run build` — on every Vercel deploy — applying pending files
 * in ../migrations to DATABASE_URL. Each file is applied in one transaction and
 * recorded in a `_migrations` table, so it runs once and is safe to re-run.
 *
 * The read is non-recursive, so the opt-in auth schema under migrations/auth/
 * is not applied to an app that never asked for sign-in.
 *
 * No DATABASE_URL (local / preview builds) -> skip; the PGLite fallback applies
 * the same files at startup instead (see src/lib/db.ts).
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { pendingMigrations } from "./migration-plan.mjs";

/** Prefer a direct / non-pooling URL for one-shot migrate (session pooler saturates). */
function resolveMigrateUrl(env = process.env) {
  for (const key of [
    "POSTGRES_URL_NON_POOLING",
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
  ]) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function toTransactionPoolerUrl(url) {
  try {
    const u = new URL(url);
    // Supabase session pooler is :5432 on *.pooler.supabase.com — migrate is
    // happier on transaction mode (:6543) which doesn't hold sessions open.
    if (
      u.hostname.includes("pooler.supabase.com") &&
      (u.port === "5432" || u.port === "")
    ) {
      u.port = "6543";
      return u.toString();
    }
  } catch {
    /* keep original */
  }
  return url;
}

const databaseUrlRaw = resolveMigrateUrl(process.env);
const databaseUrl = databaseUrlRaw
  ? toTransactionPoolerUrl(databaseUrlRaw)
  : undefined;
if (!databaseUrl) {
  console.log(
    "[migrate] DATABASE_URL / POSTGRES_URL not set — skipping (the PGLite fallback migrates itself).",
  );
  process.exit(0);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function connectWithRetry(pool, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await pool.connect();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      const retryable =
        err?.code === "XX000" ||
        /max clients|EMAXCONN|too many clients|timeout|ECONNRESET/i.test(msg);
      if (!retryable || i === attempts - 1) throw err;
      const waitMs = 1000 * 2 ** i;
      console.warn(
        `[migrate] connection busy (${msg.slice(0, 80)}) — retry in ${waitMs}ms`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function main() {
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log("[migrate] no migrations/ directory — nothing to do.");
    return;
  }
  // An app with no schema of its own must not pay for a database connection.
  if (pendingMigrations(entries, []).length === 0) {
    console.log("[migrate] no migrations — nothing to do.");
    return;
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });
  const client = await connectWithRetry(pool);
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = (await client.query("SELECT name FROM _migrations")).rows.map(
      (r) => r.name,
    );

    let count = 0;
    for (const { name } of pendingMigrations(entries, applied)) {
      const text = await readFile(join(migrationsDir, name), "utf8");
      try {
        await client.query("BEGIN");
        // pg's simple-query protocol runs a whole multi-statement file at once.
        await client.query(text);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (err) {
        console.error(`[migrate] error applying ${name}`);
        try {
          await client.query("ROLLBACK");
        } catch {
          // ROLLBACK fails when the connection died — keep the original error.
        }
        throw err;
      }
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    console.log(count ? `[migrate] done — ${count} migration(s) applied.` : "[migrate] up to date.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  // pg errors carry the context needed to debug a bad SQL file.
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
  }
  const msg = String(err?.message ?? err);
  // Deploy builds should not die when the session pooler is saturated and the
  // schema is already applied — warn and continue so app code can ship.
  if (/EMAXCONN|max clients/i.test(msg)) {
    console.warn(
      "[migrate] pool saturated — skipping this deploy migrate (schema may already be current).",
    );
    process.exit(0);
  }
  process.exit(1);
});
