import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import {
  adminCancelSubscription,
  adminDeleteUser,
  adminGrantSongCredits,
  adminGrantUsage,
  adminRequestPasswordReset,
  adminResolvePayment,
  adminSetPassword,
  adminSyncSubscription,
  getAdminBootstrap,
  listAdminUsers,
  listStuckPayments,
  listSubscriptions,
  type AdminUserRow,
} from "@/lib/auth/admin-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatUsd } from "@/lib/billing/plans";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type StuckPayment = Awaited<ReturnType<typeof listStuckPayments>>[number];
type SubRow = Awaited<ReturnType<typeof listSubscriptions>>[number];

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [tab, setTab] = useState<"users" | "subs" | "payments">("users");
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [subs, setSubs] = useState<SubRow[] | null>(null);
  const [payments, setPayments] = useState<StuckPayment[] | null>(null);
  const [admins, setAdmins] = useState<string[]>([]);
  const [stats, setStats] = useState({
    users: 0,
    stuckPayments: 0,
    activeSubs: 0,
  });
  const [stripeReady, setStripeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const reload = useCallback(async () => {
    const [boot, rows, subRows, stuck] = await Promise.all([
      getAdminBootstrap(),
      listAdminUsers(),
      listSubscriptions(),
      listStuckPayments(),
    ]);
    setAdmins(boot.admins);
    setStats(boot.stats);
    setStripeReady(boot.stripeReady);
    setUsers(rows);
    setSubs(subRows);
    setPayments(stuck);
  }, []);

  useEffect(() => {
    if (isPending || !user || !isAdminEmail(user.primaryEmail)) return;
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load admin");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, user, reload]);

  async function run(action: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(okMsg);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted">Loading…</div>
    );
  }

  if (!user) return <Navigate to="/login" />;

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
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            After Hours
          </p>
          <h1 className="font-display text-4xl text-fg">Admin</h1>
          <p className="mt-1 text-sm text-muted">
            {user.primaryEmail} · allowlist {admins.join(", ")}
            {stripeReady ? " · Stripe ready" : " · Stripe keys missing"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/pricing">Pricing</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">Studio</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Users", stats.users],
          ["Active subs", stats.activeSubs],
          ["Stuck payments", stats.stuckPayments],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-surface p-4 shadow-border">
            <p className="text-xs tracking-wide text-subtle uppercase">{label}</p>
            <p className="font-display mt-1 text-3xl text-fg">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {(
          [
            ["users", "Accounts"],
            ["subs", "Subscriptions"],
            ["payments", "Stuck payments"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            variant={tab === id ? "default" : "secondary"}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {error ? <p className="text-sm text-rec">{error}</p> : null}
      {notice ? <p className="text-sm text-accent">{notice}</p> : null}

      {tab === "users" ? (
        <section className="rounded-2xl bg-surface p-5 shadow-border">
          <h2 className="font-display text-2xl text-fg">User accounts</h2>
          <p className="mt-1 text-sm text-muted">
            Reset passwords, grant song credits / usage, or remove accounts.
          </p>
          {!users ? (
            <p className="mt-4 text-sm text-muted">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No accounts yet. Sign up at /login with japage628@gmail.com.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {users.map((u) => (
                <li key={u.id} className="flex flex-col gap-3 py-4">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                    onClick={() =>
                      setSelected((cur) => (cur?.id === u.id ? null : u))
                    }
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
                      <p className="truncate text-sm text-muted">{u.email}</p>
                    </div>
                    <div className="text-right text-xs text-subtle">
                      <p>
                        {u.planId ?? "no plan"}
                        {u.subStatus ? ` · ${u.subStatus}` : ""}
                      </p>
                      <p>
                        {u.songCredits} credits ·{" "}
                        {formatUsd(u.usageUsedCents)}/
                        {formatUsd(u.usageBudgetCents)} usage
                      </p>
                    </div>
                  </button>
                  {selected?.id === u.id ? (
                    <div className="flex flex-col gap-3 rounded-xl bg-bg p-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                adminRequestPasswordReset({
                                  data: { email: u.email },
                                }),
                              `Password reset requested for ${u.email}`,
                            )
                          }
                        >
                          Email reset
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                adminGrantSongCredits({
                                  data: { userId: u.id, count: 1 },
                                }),
                              "Granted 1 song credit",
                            )
                          }
                        >
                          +1 song credit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                adminGrantUsage({
                                  data: {
                                    userId: u.id,
                                    amountCents: 100,
                                    note: "Admin $1 usage credit",
                                  },
                                }),
                              "Granted $1 usage credit",
                            )
                          }
                        >
                          +$1 usage
                        </Button>
                        <Button
                          size="sm"
                          variant="rec"
                          disabled={busy || u.isAdmin}
                          onClick={() => {
                            if (
                              !window.confirm(`Delete account ${u.email}?`)
                            ) {
                              return;
                            }
                            void run(
                              () =>
                                adminDeleteUser({ data: { userId: u.id } }),
                              "User deleted",
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                      <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (newPassword.length < 8) {
                            setError("Password must be at least 8 characters");
                            return;
                          }
                          void run(async () => {
                            await adminSetPassword({
                              data: { userId: u.id, password: newPassword },
                            });
                            setNewPassword("");
                          }, "Password updated");
                        }}
                      >
                        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
                          <span className="text-muted">Set password</span>
                          <input
                            type="password"
                            minLength={8}
                            className="h-10 rounded-md bg-surface px-3 text-fg shadow-border outline-none focus:ring-2 focus:ring-accent/40"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                        </label>
                        <Button type="submit" size="sm" disabled={busy}>
                          Save password
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "subs" ? (
        <section className="rounded-2xl bg-surface p-5 shadow-border">
          <h2 className="font-display text-2xl text-fg">Subscriptions</h2>
          <p className="mt-1 text-sm text-muted">
            Sync from Stripe or cancel. Included AI usage follows each plan.
          </p>
          {!subs ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : subs.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No subscriptions yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {subs.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-fg">
                      {s.email ?? s.userId} · {s.planId}
                    </p>
                    <p className="text-xs text-subtle">
                      {s.status}
                      {s.periodEnd
                        ? ` · ends ${new Date(s.periodEnd).toLocaleDateString()}`
                        : ""}{" "}
                      · budget {s.usageBudgetLabel}
                      {s.cancelAtPeriodEnd ? " · canceling" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || !stripeReady}
                      onClick={() =>
                        void run(
                          () =>
                            adminSyncSubscription({
                              data: { subscriptionId: s.id },
                            }),
                          "Synced from Stripe",
                        )
                      }
                    >
                      Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || !stripeReady}
                      onClick={() =>
                        void run(
                          () =>
                            adminCancelSubscription({
                              data: {
                                subscriptionId: s.id,
                                immediately: false,
                              },
                            }),
                          "Cancel at period end",
                        )
                      }
                    >
                      Cancel EoP
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "payments" ? (
        <section className="rounded-2xl bg-surface p-5 shadow-border">
          <h2 className="font-display text-2xl text-fg">Stuck payments</h2>
          <p className="mt-1 text-sm text-muted">
            Open, failed, or incomplete checkouts and invoices.
          </p>
          {!payments ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : payments.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nothing stuck.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-fg">
                      {p.email ?? p.userId ?? "unknown"} · {p.kind} ·{" "}
                      {p.amountLabel}
                    </p>
                    <p className="text-xs text-subtle">
                      {p.status}
                      {p.planId ? ` · ${p.planId}` : ""}
                      {p.failureMessage ? ` · ${p.failureMessage}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            adminResolvePayment({
                              data: {
                                paymentId: p.id,
                                status: "complete",
                                note: "Marked complete by admin",
                              },
                            }),
                          "Marked complete",
                        )
                      }
                    >
                      Mark paid
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            adminResolvePayment({
                              data: {
                                paymentId: p.id,
                                status: "expired",
                                note: "Closed by admin",
                              },
                            }),
                          "Closed payment",
                        )
                      }
                    >
                      Close
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
