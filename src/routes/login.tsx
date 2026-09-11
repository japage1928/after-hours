import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { NeedHelpLink } from "@/components/need-help-link";
import { isAdminEmail } from "@/lib/auth/admin";
import {
  authClient,
  authEnabled,
  signIn,
  signInSocial,
} from "@/lib/auth/client";
import {
  getSignInOptions,
  type SignInOptions,
} from "@/lib/auth/sign-in-options";
import { safeNextPath } from "@/lib/booth-mode";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { NativeSocialId } from "@/lib/auth/providers";

const loginSearchSchema = z.object({
  next: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: (search) => loginSearchSchema.parse(search),
  component: LoginPage,
});

function oauthErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "google_failed" || code.includes("google")) {
    return "Google sign-in didn’t finish. Check the OAuth client secret in Vercel, then try again.";
  }
  if (code === "facebook_failed" || code.includes("facebook")) {
    return "Facebook sign-in didn’t finish. Try again or use email.";
  }
  if (code === "twitter_failed" || code.includes("twitter")) {
    return "X sign-in didn’t finish. Try again or use email.";
  }
  return "Social sign-in didn’t finish. Try again or use email.";
}

function LoginPage() {
  const { next, error: oauthError } = Route.useSearch();
  const dest = safeNextPath(next);
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() =>
    oauthErrorMessage(oauthError),
  );
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const [options, setOptions] = useState<SignInOptions | null>(null);

  useEffect(() => {
    setError(oauthErrorMessage(oauthError));
  }, [oauthError]);

  useEffect(() => {
    if (!authEnabled) return;
    void getSignInOptions()
      .then(setOptions)
      .catch(() =>
        setOptions({
          emailPassword: true,
          broker: [],
          native: [],
          callbackHints: { google: "", facebook: "", twitter: "" },
        }),
      );
  }, []);

  if (!isPending && user) {
    const home = isAdminEmail(user.primaryEmail) ? "/admin" : dest;
    if (typeof window !== "undefined") {
      window.location.replace(home);
    }
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Taking you in…
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({
          name: name.trim() || email.split("@")[0] || "Listener",
          email: email.trim(),
          password,
        });
        if (res.error) throw new Error(res.error.message || "Sign up failed");
      } else {
        const res = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (res.error) throw new Error(res.error.message || "Sign in failed");
      }
      window.location.assign(isAdminEmail(email) ? "/admin" : dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not authenticate");
      setBusy(false);
    }
  }

  async function onBroker(providerId: string, label: string) {
    setError(null);
    setSocialBusy(providerId);
    try {
      await signIn(providerId, { callbackURL: dest });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Could not continue with ${label}`,
      );
      setSocialBusy(null);
    }
  }

  async function onNative(id: NativeSocialId, label: string) {
    setError(null);
    setSocialBusy(id);
    try {
      await signInSocial(id, { callbackURL: dest });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Could not continue with ${label}`,
      );
      setSocialBusy(null);
    }
  }

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

  const hasSocial =
    (options?.broker.length ?? 0) > 0 || (options?.native.length ?? 0) > 0;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg text-fg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% 20%, rgb(216 212 200 / 0.12), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 80%, rgb(196 92 74 / 0.14), transparent 50%)",
        }}
      />
      <div className="relative mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:px-8 lg:gap-16">
        <div className="order-2 md:order-1">
          <p className="text-xs font-medium tracking-[0.2em] text-muted uppercase">
            Creator booth
          </p>
          <h1 className="font-display mt-3 text-5xl leading-[0.95] tracking-tight text-fg sm:text-6xl md:text-7xl">
            After Hours
          </h1>
          <p className="mt-4 max-w-md text-base text-muted sm:text-lg">
            Sign up, then generate an AI song in this visit — play and download
            before you leave.
          </p>
        </div>

        <div className="order-1 md:order-2">
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border md:p-6"
          >
            <div>
              <h2 className="font-display text-3xl text-fg">
                {mode === "signup" ? "Create account" : "Welcome back"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Two AI generates this month. You’ll open the Generate booth next.
              </p>
            </div>
            {mode === "signup" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Name</span>
                <input
                  className="h-11 rounded-md bg-bg px-3 text-fg shadow-border outline-none focus:ring-2 focus:ring-accent/40"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Email</span>
              <input
                type="email"
                required
                className="h-11 rounded-md bg-bg px-3 text-fg shadow-border outline-none focus:ring-2 focus:ring-accent/40"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Password</span>
              <input
                type="password"
                required
                minLength={8}
                className="h-11 rounded-md bg-bg px-3 text-fg shadow-border outline-none focus:ring-2 focus:ring-accent/40"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
              />
            </label>
            {error ? <p className="text-sm text-rec">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? "Working…"
                : mode === "signup"
                  ? "Sign up & open booth"
                  : "Sign in"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
              onClick={() => {
                setMode((m) => (m === "signin" ? "signup" : "signin"));
                setError(null);
              }}
            >
              {mode === "signup"
                ? "Already have an account? Sign in"
                : "Need an account? Sign up"}
            </button>

            {authEnabled ? (
              <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
                {options?.native.map((p) => (
                  <Button
                    key={`native-${p.id}`}
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={Boolean(socialBusy)}
                    onClick={() => void onNative(p.id, p.label)}
                  >
                    {socialBusy === p.id
                      ? "Redirecting…"
                      : `Continue with ${p.label}`}
                  </Button>
                ))}
                {options?.broker.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={Boolean(socialBusy)}
                    onClick={() => void onBroker(p.providerId, p.label)}
                  >
                    {socialBusy === p.providerId
                      ? "Redirecting…"
                      : `Continue with ${p.label}`}
                  </Button>
                ))}
                {options && !hasSocial ? (
                  <p className="text-xs text-muted">
                    Google / Facebook / X need OAuth app credentials on this
                    deploy. Email sign-in works now. Add{" "}
                    <span className="font-mono text-fg">GOOGLE_CLIENT_ID</span>{" "}
                    +{" "}
                    <span className="font-mono text-fg">
                      GOOGLE_CLIENT_SECRET
                    </span>{" "}
                    (and optional Facebook / X keys) in Vercel, with redirect URI{" "}
                    <span className="break-all font-mono text-fg">
                      {options.callbackHints.google ||
                        "https://after-hours-plum.vercel.app/api/auth/callback/google"}
                    </span>
                    .
                  </p>
                ) : null}
              </div>
            ) : null}
          </form>
          <p className="mt-3 px-1">
            <NeedHelpLink />
          </p>
        </div>
      </div>
    </div>
  );
}
