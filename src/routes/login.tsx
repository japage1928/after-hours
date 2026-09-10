import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
        <div className="h-11 w-48 animate-pulse rounded-md bg-surface-2" />
      </main>
    );
  }
  if (user) return <Navigate to="/" />;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm space-y-5">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            Late-night studio
          </p>
          <h1 className="font-display mt-1 text-4xl tracking-tight">After Hours</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in to keep your tape shelf and mash history.
          </p>
        </div>
        {authEnabled ? (
          <div className="flex flex-col gap-2">
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                className="h-11 w-full rounded-md bg-accent px-4 text-sm font-medium text-accent-fg shadow-border hover:opacity-90"
              >
                Continue with {p.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
        <Link to="/" className="block text-sm text-muted hover:text-fg">
          Back to the mash
        </Link>
      </div>
    </main>
  );
}
