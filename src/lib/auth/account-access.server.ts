import { getSql } from "../db";

export type AccountAccess = { id: string; role: "member" | "admin"; status: "active" | "suspended" };

export function bootstrapAdminIds() {
  return (process.env.MASHUP_ADMIN_USER_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean);
}

export async function requireActiveAccount(userId: string): Promise<AccountAccess> {
  if (!userId || userId === "dev-user") throw Object.assign(new Error("Sign in to use Mashup Pro."), { status: 401 });
  const sql = await getSql();
  const users = await sql`select id from "user" where id=${userId}`;
  if (!users.length) throw Object.assign(new Error("Account not found. Please sign in again."), { status: 401 });
  await sql`insert into account_controls(user_id) values(${userId}) on conflict do nothing`;
  // Explicit immutable user IDs only. Never promote the first signup or trust
  // a client-supplied email/role. Owner recovery is configured by the operator.
  if (bootstrapAdminIds().includes(userId)) {
    await sql`update account_controls set role='admin',status='active' where user_id=${userId}`;
  }
  const [account] = await sql<{ role: AccountAccess["role"]; status: AccountAccess["status"] }>`select role,status from account_controls where user_id=${userId}`;
  if (!account || account.status !== "active") throw Object.assign(new Error("Your account is suspended. Contact the site administrator."), { status: 403 });
  return { id: userId, ...account };
}
