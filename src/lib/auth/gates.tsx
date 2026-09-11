import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import {
  GROK_PROVIDERS,
  authEnabled,
  nativeSocialProvidersFromVite,
  signIn,
  signInSocial,
  signOut,
} from "./client";
import { hasGateSessionMarker } from "./gate-session-marker";
import { resolveSignInGateState } from "./sign-in-gate";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

/**
 * Auth state components — plain wrappers around `useCurrentUserState()`.
 *
 * With auth on, visitors are signed out until they authenticate — in the sandbox
 * live preview too, which does real sign-in. The shared dev user appears only
 * when auth is disabled (`VITE_AUTH_ENABLED=false`, the shipped default).
 * While the session is still resolving, gates that care about signed-out state
 * render nothing so there's no signed-out flash on hard reload.
 */

/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
export const SIGN_IN_PATH = "/login";

/** Render children only when a user is present (real session, or the disabled-auth dev user). */
export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

/**
 * Render children only once we KNOW the visitor is signed out (`isPending` has
 * cleared and there is no user). Hidden while the session is still loading.
 */
export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

/**
 * Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
 * `window.location` reload). A hard navigation re-bootstraps the SPA and re-runs
 * session loading, which feels like a second "Loading…" on /login.
 *
 * Guard routes by waiting out `isPending` first (see `use-current-user`), then
 * render this.
 */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

export function SignInGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, isPending } = useCurrentUserState();
  const state = resolveSignInGateState({ isPending, hasUser: user !== null });
  if (state === "pending") return null;
  if (state === "signed_in") return <>{children}</>;
  return <>{fallback ?? <SignInButtons />}</>;
}

export function SignInButtons() {
  const native = nativeSocialProvidersFromVite();
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {GROK_PROVIDERS.map((p) => (
        <button
          key={p.providerId}
          type="button"
          onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
          className="w-full cursor-pointer rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-fg shadow-border hover:bg-surface-2"
        >
          Continue with {p.label}
        </button>
      ))}
      {native.map((p) => (
        <button
          key={`native-${p.id}`}
          type="button"
          onClick={() => void signInSocial(p.id, { callbackURL: "/" })}
          className="w-full cursor-pointer rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-fg shadow-border hover:bg-surface-2"
        >
          Continue with {p.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Minimal signed-in identity chip + sign-out. Restyle freely (see the
 * `design-ui` skill). Sign-out is only shown when auth is enabled (the
 * disabled-auth dev user has nothing to sign out of) and the session is not
 * gate-materialized — behind the gate the next request signs the viewer
 * straight back in, so a sign-out control there is a broken loop.
 */
export function UserButton() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 items-center gap-2 rounded-md bg-surface-2 px-2 shadow-border"
      >
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className="size-7 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-7 place-items-center rounded-full bg-surface text-xs font-medium text-fg">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="hidden max-w-[7rem] truncate text-sm font-medium text-fg sm:inline">
          {label}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl bg-surface py-1 shadow-border"
        >
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-medium text-fg">{label}</p>
            {user.primaryEmail ? (
              <p className="truncate text-xs text-muted">{user.primaryEmail}</p>
            ) : null}
          </div>
          <Link
            to="/settings"
            role="menuitem"
            className="block px-3 py-2 text-sm text-fg hover:bg-surface-2"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <Link
            to="/pricing"
            role="menuitem"
            className="block px-3 py-2 text-sm text-fg hover:bg-surface-2"
            onClick={() => setOpen(false)}
          >
            Plans
          </Link>
          {authEnabled && !gateSession ? (
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 disabled:opacity-60"
              onClick={() => {
                setSigningOut(true);
                void signOut("/login").catch(() => setSigningOut(false));
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
