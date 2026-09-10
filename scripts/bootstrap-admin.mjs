#!/usr/bin/env node
import pg from "pg";

const email = process.env.MASHUP_BOOTSTRAP_ADMIN_EMAIL?.trim();
if (!email) {
  console.log("[admin-bootstrap] no bootstrap email configured; skipping.");
  process.exit(0);
}

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL_UNPOOLED;

if (!databaseUrl) {
  throw new Error("Production Postgres connection is unavailable during build.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const users = await client.query(
    'select id, email from "user" where lower(email) = lower($1) limit 2',
    [email],
  );

  if (users.rowCount !== 1) {
    throw new Error(
      users.rowCount === 0
        ? "Existing bootstrap account was not found."
        : "Bootstrap email matched more than one account.",
    );
  }

  const userId = users.rows[0].id;

  await client.query(
    `insert into account_controls(user_id, role, status, updated_at)
     values($1, 'admin', 'active', now())
     on conflict (user_id) do update
       set role = 'admin', status = 'active', updated_at = now()`,
    [userId],
  );

  const verified = await client.query(
    `select u.email, c.role, c.status
       from "user" u
       join account_controls c on c.user_id = u.id
      where u.id = $1`,
    [userId],
  );

  const account = verified.rows[0];
  if (
    verified.rowCount !== 1 ||
    account?.role !== "admin" ||
    account?.status !== "active"
  ) {
    throw new Error("Admin promotion verification failed.");
  }

  await client.query("COMMIT");
  console.log("[admin-bootstrap] existing account verified as active administrator.");
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
  throw error;
} finally {
  client.release();
  await pool.end();
}
