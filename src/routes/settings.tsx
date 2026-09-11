import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, isPending } = useCurrentUserState();

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

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            After Hours
          </p>
          <h1 className="font-display text-4xl text-fg md:text-5xl">Settings</h1>
          <p className="mt-2 text-sm text-muted">Your account and sign-out.</p>
        </div>
        <Button asChild variant="secondary">
          <Link to="/">Booth</Link>
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
