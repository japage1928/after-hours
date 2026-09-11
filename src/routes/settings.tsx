import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  getMyBilling,
  startBillingPortal,
} from "@/lib/billing/billing-api";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, isPending } = useCurrentUserState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<{
    songCredits: number;
    usageUsedCents: number;
    usageBudgetCents: number;
    planId?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!user || user.isDevFallback) return;
    void (async () => {
      try {
        const mine = await getMyBilling();
        setEntitlement(mine.entitlement);
      } catch {
        /* ignore */
      }
    })();
  }, [user]);

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  async function openPortal() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await startBillingPortal();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            After Hours
          </p>
          <h1 className="font-display text-4xl text-fg md:text-5xl">Settings</h1>
          <p className="mt-2 text-sm text-muted">
            Your account, plans, and sign-out.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link to="/">Studio</Link>
        </Button>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          Profile
        </p>
        <div className="flex items-center gap-3">
          {user.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="size-12 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-lg font-medium text-fg">
              {(user.displayName ?? user.primaryEmail ?? "A")
                .charAt(0)
                .toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-2xl text-fg">
              {user.displayName ?? "Listener"}
            </p>
            <p className="truncate text-sm text-muted">
              {user.primaryEmail ?? "No email on file"}
            </p>
          </div>
        </div>
        {isAdminEmail(user.primaryEmail) ? (
          <Button asChild variant="secondary" className="w-fit">
            <Link to="/admin">Open admin</Link>
          </Button>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          Billing
        </p>
        {entitlement ? (
          <p className="text-sm text-muted">
            {entitlement.songCredits > 0
              ? `${entitlement.songCredits} song credit(s)`
              : entitlement.usageBudgetCents > 0
                ? `${(entitlement.usageUsedCents / 100).toFixed(2)} / ${(entitlement.usageBudgetCents / 100).toFixed(2)} included AI this period`
                : "No plan yet — mash for free, upgrade when you write with AI"}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Mash is free. Plans unlock AI writing.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/pricing">View plans</Link>
          </Button>
          {!user.isDevFallback ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void openPortal()}
            >
              {busy ? "Opening…" : "Manage billing"}
            </Button>
          ) : null}
        </div>
        {error ? <p className="text-sm text-rec">{error}</p> : null}
      </section>

      {authEnabled && !user.isDevFallback ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            Session
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            onClick={() => void signOut("/login")}
          >
            Sign out
          </Button>
        </section>
      ) : null}
    </div>
  );
}
