import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  nativeSocialProvidersFromVite,
  signIn,
  signInSocial,
} from "@/lib/auth/client";
import { safeNextPath } from "@/lib/booth-mode";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const loginSearchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: (search) => loginSearchSchema.parse(search),
  component: LoginPage,
});

function LoginPage() {
  const { next } = Route.useSearch();
  const dest = safeNextPath(next);
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isPending && user) {
    const home = isAdminEmail(user.primaryEmail) ? "/admin" : dest;
    return <Navigate to={home} />;
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

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

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
            Remix booth
          </p>
          <h1 className="font-display mt-3 text-5xl leading-[0.95] tracking-tight text-fg sm:text-6xl md:text-7xl">
            After Hours
          </h1>
          <p className="mt-4 max-w-md text-base text-muted sm:text-lg">
            Mashup or remix — load two tracks you own and open the booth.
          </p>
        </div>

        <div className="order-1 md:order-2">
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-3 rounded-2xl bg-surface/90 p-5 shadow-border backdrop-blur-sm md:p-6"
          >
            <div>
              <h2 className="font-display text-3xl text-fg">
                {mode === "signup" ? "Create account" : "Welcome back"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Free booth — pick mashup or remix after you sign in.
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
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() =>
                      void signIn(p.providerId, { callbackURL: dest })
                    }
                  >
                    Continue with {p.label}
                  </Button>
                ))}
                {nativeSocialProvidersFromVite().map((p) => (
                  <Button
                    key={`native-${p.id}`}
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() =>
                      void signInSocial(p.id, { callbackURL: dest })
                    }
                  >
                    Continue with {p.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
