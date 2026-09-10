import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

export const myAccount = createServerFn({ method: "GET" }).middleware([authMiddleware])
  .handler(async ({ context }) => context.account);

export const listAccounts = createServerFn({ method: "GET" }).middleware([authMiddleware])
  .validator((input: unknown) => z.object({ search: z.string().max(200).default(""), offset: z.number().int().min(0).max(100000).default(0) }).parse(input))
  .handler(async ({ context, data }) => {
    if (context.account.role !== "admin") throw new Error("Administrator access required.");
    const { getSql } = await import("./db");
    const { bootstrapAdminIds } = await import("./auth/account-access.server");
    const sql = await getSql();
    const query = `%${data.search}%`;
    const rows = await sql<{ id: string; name: string; email: string; role: "admin" | "member"; status: "active" | "suspended"; created: string; sessions: number }>`
      select u.id,u.name,u.email,coalesce(c.role,'member') as role,coalesce(c.status,'active') as status,
      u."createdAt"::text as created,
      (select count(*)::int from "session" s where s."userId"=u.id and s."expiresAt">now()) as sessions
      from "user" u left join account_controls c on c.user_id=u.id
      where u.email ilike ${query} or u.name ilike ${query}
      order by u."createdAt" desc,u.id limit 51 offset ${data.offset}`;
    return { accounts: rows.slice(0,50), hasMore: rows.length > 50, protectedIds: [...bootstrapAdminIds(), context.userId] };
  });

export const updateAccount = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .validator((input: unknown) => z.object({ userId: z.string().min(1).max(200), action: z.enum(["suspend","reactivate","make_admin","make_member","revoke_sessions"]) }).parse(input))
  .handler(async ({ context, data }) => {
    if (context.account.role !== "admin") throw new Error("Administrator access required.");
    const { bootstrapAdminIds } = await import("./auth/account-access.server");
    if (data.userId === context.userId || bootstrapAdminIds().includes(data.userId)) throw new Error("This administrator account is protected.");
    const { getSql } = await import("./db");
    const sql = await getSql();
    await sql`select manage_account(${context.userId},${data.userId},${data.action})`;
    return { ok: true };
  });
