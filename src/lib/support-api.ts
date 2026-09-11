import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/billing/usage";
import {
  MAX_OPEN_TICKETS_PER_USER,
  parseCreateSupportTicket,
  type SupportCategory,
  type SupportStatus,
} from "@/lib/support";

function iso(value: Date | string | null | undefined): string {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

export type MySupportTicket = {
  id: string;
  category: SupportCategory;
  message: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
};

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseCreateSupportTicket(input))
  .handler(async ({ context, data }): Promise<{ ok: true; id: string }> => {
    const sql = await getSql();
    const users = await sql<{ email: string }>`
      select email from "user" where id = ${context.userId} limit 1
    `;
    const email = users[0]?.email ?? null;
    if (!email) {
      throw new Error(
        "Support needs a signed-in account with an email on file.",
      );
    }

    const open = await sql<{ n: number }>`
      select count(*)::int as n
      from support_ticket
      where user_id = ${context.userId} and status = 'open'
    `;
    if (Number(open[0]?.n ?? 0) >= MAX_OPEN_TICKETS_PER_USER) {
      throw new Error(
        `You already have ${MAX_OPEN_TICKETS_PER_USER} open tickets. Wait for a reply or check existing ones below.`,
      );
    }

    const id = newId("tkt");
    await sql`
      insert into support_ticket (
        id, user_id, email, category, message, status
      ) values (
        ${id},
        ${context.userId},
        ${email},
        ${data.category},
        ${data.message},
        ${"open"}
      )
    `;
    return { ok: true as const, id };
  });

export const listMySupportTickets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MySupportTicket[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      category: string;
      message: string;
      status: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>`
      select id, category, message, status, created_at, updated_at
      from support_ticket
      where user_id = ${context.userId}
      order by created_at desc
      limit 50
    `;
    return rows.map((r) => ({
      id: r.id,
      category: r.category as SupportCategory,
      message: r.message,
      status: r.status as SupportStatus,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    }));
  });
