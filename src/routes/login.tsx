import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isPending && user) {
    const dest = isAdminEmail(user.primaryEmail) ? "/admin" : "/";
    return <Navigate to={dest} />;
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
      window.location.assign(isAdminEmail(email) ? "/admin" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not authenticate");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          After Hours
        </p>
        <h1 className="font-display mt-1 text-4xl text-fg">Sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Create or sign in with email
          {authEnabled ? ", or continue with a connected provider." : "."}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border"
      >
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
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
        {error ? <p className="text-sm text-rec">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
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
      </form>

      {authEnabled ? (
        <div className="flex flex-col gap-2">
          {GROK_PROVIDERS.map((p) => (
            <Button
              key={p.providerId}
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
            >
              Continue with {p.label}
            </Button>
          ))}
        </div>
      ) : null}

      <Link to="/" className="text-center text-sm text-muted hover:text-fg">
        Back to studio
      </Link>
    </div>
  );
}
