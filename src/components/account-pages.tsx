import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { NeedHelpLink } from "@/components/need-help-link";
import {
  deleteMyAccount,
  listMyAuthProviders,
  updateMyProfile,
} from "@/lib/account-api";
import { isAdminEmail } from "@/lib/auth/admin";
import { authClient, authEnabled, signOut } from "@/lib/auth/client";
import { UserButton } from "@/lib/auth/gates";
import {
  useCurrentUser,
  useCurrentUserState,
} from "@/lib/auth/use-current-user";
import {
  cancelMySubscription,
  getMyBilling,
  resumeMySubscription,
  startBillingPortal,
} from "@/lib/billing/billing-api";
import { type BoothMode, BOOTH_MODES } from "@/lib/booth-mode";
import { readDefaultBooth, writeDefaultBooth } from "@/lib/prefs";
import {
  deleteSavedTrack,
  downloadExtension,
  listSavedTracks,
  nextGrooveStyle,
  writeLibraryHandoff,
  type SavedTrack,
} from "@/lib/track-library";
import { ACCOUNT_PAGES, type AccountPagePath } from "@/lib/account-nav";
import { cn, formatTime } from "@/lib/utils";

export type { AccountPagePath };
export { ACCOUNT_PAGES };

export function AccountShell({
  active,
  children,
}: {
  active: AccountPagePath;
  children: ReactNode;
}) {
  const user = useCurrentUser();

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            After Hours
          </p>
          <h1 className="font-display text-4xl text-fg md:text-5xl">Account</h1>
          <p className="mt-2 text-sm text-muted">
            Settings, library, profile, billing — and a clear exit when you want
            one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NeedHelpLink />
          <Button asChild variant="secondary">
            <Link to="/">Home</Link>
          </Button>
          <UserButton />
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <nav
          aria-label="Account sections"
          className="flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col md:overflow-visible"
        >
          {ACCOUNT_PAGES.map((page) => (
            <Link
              key={page.path}
              to={page.path}
              className={cn(
                "rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
                active === page.path
                  ? "bg-surface-2 text-fg shadow-border"
                  : "text-muted hover:bg-surface hover:text-fg",
              )}
            >
              {page.label}
            </Link>
          ))}
          {user && isAdminEmail(user.primaryEmail) ? (
            <Link
              to="/admin"
              className="rounded-md px-3 py-2 text-sm text-muted hover:bg-surface hover:text-fg"
            >
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function Panel({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl bg-surface p-5 shadow-border md:p-6">
      <div>
        <h2 className="font-display text-2xl text-fg md:text-3xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

export function SettingsPanel() {
  const [booth, setBooth] = useState<BoothMode | null>(null);

  useEffect(() => {
    setBooth(readDefaultBooth());
  }, []);

  function choose(mode: BoothMode | null) {
    writeDefaultBooth(mode);
    setBooth(mode);
  }

  return (
    <Panel title="Settings" blurb="Booth defaults that stay on this device.">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          Default booth
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(BOOTH_MODES) as BoothMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => choose(mode)}
              className={cn(
                "rounded-md px-3 py-2 text-sm capitalize shadow-border transition-colors",
                booth === mode
                  ? "bg-accent text-accent-fg"
                  : "bg-surface-2 text-fg hover:shadow-border-hover",
              )}
            >
              {mode}
            </button>
          ))}
          <button
            type="button"
            onClick={() => choose(null)}
            className={cn(
              "rounded-md px-3 py-2 text-sm shadow-border transition-colors",
              booth === null
                ? "bg-accent text-accent-fg"
                : "bg-surface-2 text-fg hover:shadow-border-hover",
            )}
          >
            Ask each time
          </button>
        </div>
        <p className="text-xs text-subtle">
          Landing still offers Generate, Remix, and Mashup. This only remembers
          a preference for shortcuts on this browser.
        </p>
      </div>
    </Panel>
  );
}

export function ProjectsPanel() {
  const [tracks, setTracks] = useState<SavedTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  async function refresh() {
    try {
      const rows = await listSavedTracks();
      setTracks(rows);
      setError(null);
    } catch (err) {
      setTracks([]);
      setError(
        err instanceof Error
          ? err.message
          : "Couldn’t open the library on this device.",
      );
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function downloadTrack(track: SavedTrack) {
    const url = URL.createObjectURL(track.blob);
    const a = document.createElement("a");
    a.href = url;
    const slug =
      track.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "after-hours";
    a.download = `${slug}.${downloadExtension(track.mime)}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
  }

  function remixThis(track: SavedTrack) {
    writeLibraryHandoff({
      kind: "remix-source",
      trackId: track.id,
      style: track.style,
    });
    window.location.assign("/remix");
  }

  function tryAnotherStyle(track: SavedTrack) {
    const style = nextGrooveStyle(track.style);
    if (track.mode === "generate" && track.prompt) {
      writeLibraryHandoff({
        kind: "generate-again",
        prompt: track.prompt,
        style,
      });
      window.location.assign("/generate");
      return;
    }
    writeLibraryHandoff({
      kind: "remix-source",
      trackId: track.id,
      style,
    });
    window.location.assign("/remix");
  }

  return (
    <Panel
      title="Library"
      blurb="Completed Generate, Remix, and Mashup tracks on this device — play, download, or take another pass."
    >
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link to="/generate">Generate</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link to="/remix">Remix</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link to="/mashup">Mashup</Link>
        </Button>
      </div>

      {error ? <p className="text-sm text-rec">{error}</p> : null}

      {tracks === null ? (
        <p className="text-sm text-muted">Loading library…</p>
      ) : tracks.length === 0 ? (
        <p className="text-sm text-muted">
          No finished tracks yet. Generate, remix, or mashup once and the result
          lands here automatically.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tracks.map((track) => (
            <li
              key={track.id}
              className="flex flex-col gap-3 rounded-xl bg-surface-2 px-3 py-3 shadow-border"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{track.title}</p>
                  <p className="text-xs text-muted">
                    {track.mode}
                    {track.bpm ? ` · ${Math.round(track.bpm)} BPM` : ""}
                    {` · ${formatTime(track.duration)}`}
                    {` · ${track.engine === "ace-step" ? "ACE-Step" : "Local mix"}`}
                  </p>
                </div>
              </div>
              {playingId === track.id ? (
                <LibraryAudio blob={track.blob} />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setPlayingId((id) => (id === track.id ? null : track.id))
                  }
                >
                  {playingId === track.id ? "Hide player" : "Play"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadTrack(track)}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => remixThis(track)}
                >
                  Remix this
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => tryAnotherStyle(track)}
                >
                  Try another style
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rec"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete “${track.title}” from this device?`,
                      )
                    ) {
                      void deleteSavedTrack(track.id).then(() => refresh());
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function LibraryAudio({ blob }: { blob: Blob }) {
  const [url] = useState(() => URL.createObjectURL(blob));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <audio controls autoPlay className="w-full" src={url} />;
}

export function ProfilePanel() {
  const { user } = useCurrentUserState();
  const [name, setName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.displayName ?? "");
  }, [user?.displayName]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (user?.isDevFallback) {
        throw new Error("Dev fallback user can’t update a remote profile.");
      }
      await updateMyProfile({ data: { name: name.trim() } });
      await authClient.getSession();
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Profile" blurb="How you show up in After Hours.">
      <div className="flex items-center gap-3">
        {user?.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className="size-14 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-14 place-items-center rounded-full bg-surface-2 text-xl font-medium text-fg">
            {(user?.displayName ?? user?.primaryEmail ?? "A")
              .charAt(0)
              .toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-2xl text-fg">
            {user?.displayName ?? "Listener"}
          </p>
          <p className="truncate text-sm text-muted">
            {user?.primaryEmail ?? "No email on file"}
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void onSave(e)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="h-11 rounded-md bg-surface-2 px-3 text-fg shadow-border outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
          {message ? <p className="text-sm text-muted">{message}</p> : null}
          {error ? <p className="text-sm text-rec">{error}</p> : null}
        </div>
      </form>
    </Panel>
  );
}

export function AccountPanel() {
  const { user } = useCurrentUserState();
  const [providers, setProviders] = useState<
    Array<{ providerId: string; createdAt: string }>
  >([]);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.isDevFallback) return;
    void listMyAuthProviders()
      .then((res) => setProviders(res.providers))
      .catch(() => setProviders([]));
  }, [user]);

  async function onDelete() {
    setError(null);
    if (confirm !== "DELETE") {
      setError("Type DELETE to confirm.");
      return;
    }
    if (
      !window.confirm(
        "Delete your After Hours profile permanently? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteMyAccount({ data: { confirmation: "DELETE" } });
      await signOut("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account");
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Account"
      blurb="Sign-in details and a permanent delete — always available."
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          Email
        </p>
        <p className="text-sm text-fg">
          {user?.primaryEmail ?? "No email on file"}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          Sign-in methods
        </p>
        {providers.length === 0 ? (
          <p className="text-sm text-muted">
            {user?.isDevFallback
              ? "Local listener (auth off)."
              : "No linked providers found."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-fg">
            {providers.map((p) => (
              <li key={`${p.providerId}-${p.createdAt}`}>{p.providerId}</li>
            ))}
          </ul>
        )}
      </div>

      {authEnabled && !user?.isDevFallback ? (
        <div className="flex flex-col gap-2 border-t border-line pt-5">
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
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-rec/30 bg-rec/5 p-4">
        <div>
          <p className="font-medium text-fg">Delete profile</p>
          <p className="mt-1 text-sm text-muted">
            Removes your account, sessions, and billing records. Active Stripe
            subscriptions are canceled first. Local projects on this device are
            not wiped automatically.
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">
            Type <span className="font-mono text-fg">DELETE</span> to confirm
          </span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={Boolean(user?.isDevFallback)}
            className="h-11 rounded-md bg-surface-2 px-3 text-fg shadow-border outline-none focus-visible:ring-2 focus-visible:ring-rec/40 disabled:opacity-50"
            autoComplete="off"
          />
        </label>
        <Button
          variant="rec"
          className="w-fit"
          disabled={
            busy || confirm !== "DELETE" || Boolean(user?.isDevFallback)
          }
          onClick={() => void onDelete()}
        >
          {busy ? "Deleting…" : "Delete profile"}
        </Button>
        {error ? <p className="text-sm text-rec">{error}</p> : null}
      </div>
    </Panel>
  );
}

export function BillingPanel() {
  const { user } = useCurrentUserState();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [billing, setBilling] = useState<{
    stripeReady: boolean;
    entitlement: {
      ok: boolean;
      planId?: string | null;
      usageUsedCents: number;
      usageBudgetCents: number;
      songCredits: number;
      remixesUsed: number;
      remixesLimit: number;
      remixPeriod: "month" | "week" | "credit" | null;
      periodEnd: string | null;
      source?: string;
    };
    subscription: {
      id: string;
      planId: string;
      planName: string;
      status: string;
      cancelAtPeriodEnd: boolean;
      periodEnd: string | null;
      priceLabel: string | null;
    } | null;
  } | null>(null);

  async function refresh() {
    if (!user || user.isDevFallback) return;
    const mine = await getMyBilling();
    setBilling(mine);
  }

  useEffect(() => {
    void refresh().catch(() => setBilling(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function openPortal() {
    setError(null);
    setBusy("portal");
    try {
      const { url } = await startBillingPortal();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open portal");
      setBusy(null);
    }
  }

  async function cancel(immediately: boolean) {
    setError(null);
    setMessage(null);
    const label = immediately
      ? "Cancel immediately and lose remaining time on this period?"
      : "Cancel at the end of the current billing period? You’ll keep access until then.";
    if (!window.confirm(label)) return;
    setBusy(immediately ? "cancel-now" : "cancel");
    try {
      await cancelMySubscription({ data: { immediately } });
      await refresh();
      setMessage(
        immediately
          ? "Subscription canceled."
          : "Subscription will end after this period.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(null);
    }
  }

  async function resume() {
    setError(null);
    setMessage(null);
    setBusy("resume");
    try {
      await resumeMySubscription();
      await refresh();
      setMessage("Cancellation withdrawn — subscription stays active.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume failed");
    } finally {
      setBusy(null);
    }
  }

  const sub = billing?.subscription ?? null;
  const ent = billing?.entitlement;
  const canCancel = Boolean(sub) && Boolean(billing?.stripeReady);
  const periodLabel = sub?.periodEnd
    ? new Date(sub.periodEnd).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Panel
      title="Billing"
      blurb="Plans, usage, and cancel — cancel stays on this page even when you have no plan."
    >
      {!billing && !user?.isDevFallback ? (
        <p className="text-sm text-muted">Loading billing…</p>
      ) : null}

      {user?.isDevFallback ? (
        <p className="text-sm text-muted">
          Billing needs a real signed-in account.
        </p>
      ) : null}

      {ent ? (
        <div className="flex flex-col gap-1 text-sm text-muted">
          <p>
            Plan:{" "}
            <span className="text-fg">
              {sub?.planName ??
                (ent.songCredits > 0
                  ? "Mix credits"
                  : ent.source === "free"
                    ? "Free"
                    : "None")}
            </span>
            {sub?.priceLabel ? <span> · {sub.priceLabel}/mo</span> : null}
          </p>
          <p>
            AI generate / remix{" "}
            {ent.remixPeriod === "week"
              ? "this week"
              : ent.remixPeriod === "month"
                ? "this month"
                : "available"}
            :{" "}
            <span className="text-fg">
              {ent.songCredits > 0
                ? `${ent.songCredits} credit(s)`
                : `${ent.remixesUsed} / ${ent.remixesLimit}`}
            </span>
          </p>
          {sub?.cancelAtPeriodEnd && periodLabel ? (
            <p className="text-rec">Cancels at period end ({periodLabel}).</p>
          ) : periodLabel ? (
            <p>Current period ends {periodLabel}.</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link to="/pricing">View plans</Link>
        </Button>
        <Button
          variant="secondary"
          disabled={
            Boolean(busy) ||
            !billing?.stripeReady ||
            Boolean(user?.isDevFallback)
          }
          onClick={() => void openPortal()}
        >
          {busy === "portal" ? "Opening…" : "Stripe customer portal"}
        </Button>
      </div>

      {!billing?.stripeReady && !user?.isDevFallback ? (
        <p className="text-sm text-muted">
          Stripe isn’t configured on this deploy yet — cancel will light up once
          keys are set.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
        <div>
          <p className="font-medium text-fg">Cancel subscription</p>
          <p className="mt-1 text-sm text-muted">
            Always here. If you’re not on a plan, the button stays visible but
            disabled — no hunting through Stripe for an exit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="rec"
            disabled={
              !canCancel || Boolean(busy) || Boolean(sub?.cancelAtPeriodEnd)
            }
            onClick={() => void cancel(false)}
          >
            {busy === "cancel"
              ? "Canceling…"
              : sub?.cancelAtPeriodEnd
                ? "Already canceling"
                : sub
                  ? "Cancel at period end"
                  : "Cancel subscription"}
          </Button>
          {sub && !sub.cancelAtPeriodEnd ? (
            <Button
              variant="secondary"
              disabled={!canCancel || Boolean(busy)}
              onClick={() => void cancel(true)}
            >
              {busy === "cancel-now" ? "Canceling…" : "Cancel immediately"}
            </Button>
          ) : null}
          {sub?.cancelAtPeriodEnd ? (
            <Button
              variant="secondary"
              disabled={!canCancel || Boolean(busy)}
              onClick={() => void resume()}
            >
              {busy === "resume" ? "Resuming…" : "Keep my subscription"}
            </Button>
          ) : null}
        </div>
        {!sub ? (
          <p className="text-xs text-subtle">
            No active subscription on this account.
          </p>
        ) : null}
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-rec">{error}</p> : null}
    </Panel>
  );
}
