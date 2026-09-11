import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { adminEmails, isAdminEmail } from "@/lib/auth/admin";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  isAdmin: boolean;
};

async function requireAdminSession() {
  const request = getRequest();
  if (!request) throw new Error("Forbidden");
  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user?.email ?? null;
  if (!session?.user || !isAdminEmail(email)) {
    throw new Error("Forbidden");
  }
  return session.user;
}

export const getAdminBootstrap = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireAdminSession();
    return {
      email: user.email,
      name: user.name,
      admins: adminEmails(),
    };
  },
);

export const listAdminUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminUserRow[]> => {
    await requireAdminSession();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      email: string;
      emailVerified: boolean;
      createdAt: Date | string;
    }>`
      select id, name, email, "emailVerified", "createdAt"
      from "user"
      order by "createdAt" desc
      limit 200
    `;
    const admins = new Set(adminEmails());
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      emailVerified: Boolean(r.emailVerified),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
      isAdmin: admins.has(r.email.trim().toLowerCase()),
    }));
  },
);
