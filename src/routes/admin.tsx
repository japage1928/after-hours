import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import {
  getAdminBootstrap,
  listAdminUsers,
  type AdminUserRow,
} from "@/lib/auth/admin.server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [admins, setAdmins] = useState<string[]>([]);

  useEffect(() => {
    if (isPending || !user || !isAdminEmail(user.primaryEmail)) return;
    let cancelled = false;
    void (async () => {
      try {
        const [boot, rows] = await Promise.all([
          getAdminBootstrap(),
          listAdminUsers(),
        ]);
        if (cancelled) return;
        setAdmins(boot.admins);
        setUsers(rows);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load admin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, user]);

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted">Loading…</div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!isAdminEmail(user.primaryEmail)) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4">
        <h1 className="font-display text-3xl text-fg">Admin only</h1>
        <p className="text-sm text-muted">
          Signed in as {user.primaryEmail ?? user.displayName}, which is not on
          the admin allowlist.
        </p>
        <Button asChild variant="secondary">
          <Link to="/">Back to studio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            After Hours
          </p>
          <h1 className="font-display text-4xl text-fg">Admin</h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as {user.primaryEmail}. Allowlist:{" "}
            {admins.join(", ") || "—"}
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link to="/">Studio</Link>
        </Button>
      </header>

      {error ? <p className="text-sm text-rec">{error}</p> : null}

      <section className="rounded-2xl bg-surface p-5 shadow-border">
        <h2 className="font-display text-2xl text-fg">Users</h2>
        <p className="mt-1 text-sm text-muted">
          Accounts stored in Supabase via Better Auth.
        </p>
        {!users ? (
          <p className="mt-4 text-sm text-muted">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No accounts yet. Sign up at /login with japage628@gmail.com to claim
            admin.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">
                    {u.name || "—"}{" "}
                    {u.isAdmin ? (
                      <span className="text-xs tracking-wide text-accent uppercase">
                        admin
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-muted">{u.email}</p>
                </div>
                <p className="text-xs tabular-nums text-subtle">
                  {new Date(u.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
