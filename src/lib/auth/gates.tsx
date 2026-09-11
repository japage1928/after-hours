import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate } from "@tanstack/react-router";
import {
  authEnabled,
  signIn,
  signInSocial,
  signOut,
} from "./client";
import { hasGateSessionMarker } from "./gate-session-marker";
import { resolveSignInGateState } from "./sign-in-gate";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";
import { ACCOUNT_PAGES } from "@/lib/account-nav";

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
  const [options, setOptions] = useState<{
    broker: Array<{ providerId: string; label: string }>;
    native: Array<{ id: "google" | "facebook" | "twitter"; label: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void import("./sign-in-options")
      .then((m) => m.getSignInOptions())
      .then((opts) =>
        setOptions({ broker: opts.broker, native: opts.native }),
      )
      .catch(() => setOptions({ broker: [], native: [] }));
  }, []);

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {(options?.native ?? []).map((p) => (
        <button
          key={`native-${p.id}`}
          type="button"
          onClick={() => {
            setError(null);
            void signInSocial(p.id, { callbackURL: "/" }).catch((err) =>
              setError(err instanceof Error ? err.message : "Sign-in failed"),
            );
          }}
          className="w-full cursor-pointer rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-fg shadow-border hover:bg-surface-2"
        >
          Continue with {p.label}
        </button>
      ))}
      {(options?.broker ?? []).map((p) => (
        <button
          key={p.providerId}
          type="button"
          onClick={() => {
            setError(null);
            void signIn(p.providerId, { callbackURL: "/" }).catch((err) =>
              setError(err instanceof Error ? err.message : "Sign-in failed"),
            );
          }}
          className="w-full cursor-pointer rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-fg shadow-border hover:bg-surface-2"
        >
          Continue with {p.label}
        </button>
      ))}
      {error ? <p className="text-sm text-rec">{error}</p> : null}
    </div>
  );
}

/**
 * Signed-in identity chip + account menu. Menu is portaled to `document.body`
 * with a solid background so sticky headers / page overlays can’t clip it or
 * wash it out.
 */
export function UserButton() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    place();

    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    // Use click (not mousedown) so menu links receive the full click.
    document.addEventListener("click", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("click", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-[100] w-56 overflow-hidden rounded-xl border border-line bg-[#161614] py-1 text-fg shadow-[0_12px_40px_rgb(0_0_0_/_0.55)]"
          >
            <div className="border-b border-line bg-[#161614] px-3 py-2">
              <p className="truncate text-sm font-medium text-fg">{label}</p>
              {user.primaryEmail ? (
                <p className="truncate text-xs text-muted">{user.primaryEmail}</p>
              ) : null}
            </div>
            {ACCOUNT_PAGES.map((page) => (
              <Link
                key={page.path}
                to={page.path}
                role="menuitem"
                className="block cursor-pointer bg-[#161614] px-3 py-2.5 text-sm text-fg hover:bg-[#1e1e1b]"
                onClick={() => setOpen(false)}
              >
                {page.label}
              </Link>
            ))}
            {authEnabled && !gateSession ? (
              <button
                type="button"
                role="menuitem"
                disabled={signingOut}
                className="mt-1 block w-full cursor-pointer border-t border-line bg-[#161614] px-3 py-2.5 text-left text-sm text-fg hover:bg-[#1e1e1b] disabled:opacity-60"
                onClick={() => {
                  setSigningOut(true);
                  void signOut("/login").catch(() => setSigningOut(false));
                }}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        className="relative z-[101] flex h-11 items-center gap-2 rounded-md bg-surface-2 px-2 shadow-border"
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
      {menu}
    </>
  );
}
