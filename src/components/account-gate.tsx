import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { myAccount } from "@/lib/accounts-api";

export function AccountGate({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  const [access, setAccess] = useState<{ id: string; role: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setAccess(null); setError("");
    const refresh = async () => {
      if (!user || user.isDevFallback) return;
      try {
        const account = await myAccount();
        if (!cancelled) { setAccess(account); setError(""); }
      } catch {
        if (!cancelled) { setAccess(null); setError("Your account cannot access Mashup Pro. It may be suspended or your session may have expired."); }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user?.id, user?.isDevFallback]);
  if (isPending) return <main className="p-8 text-fg">Checking your account…</main>;
  if (!user || user.isDevFallback) return <main className="mx-auto max-w-lg space-y-5 p-8 text-fg">
    <h1 className="font-display text-4xl">Mashup Pro</h1>
    <p>Sign in or create an account to mix, remix and download your songs.</p>
    <Link to="/login" className="inline-block rounded bg-accent px-5 py-3 text-accent-fg">Sign in / create account</Link>
  </main>;
  if (error) return <main className="mx-auto max-w-lg space-y-5 p-8 text-fg"><h1 className="text-2xl">Account access</h1><p role="alert">{error}</p><button onClick={() => void signOut()}>Sign out and try again</button></main>;
  if (!access || access.id !== user.id) return <main className="p-8 text-fg">Checking your account…</main>;
  if (admin && access.role !== "admin") return <main className="space-y-4 p-8 text-fg"><h1 className="text-2xl">Administrator access required</h1><Link to="/">Back to Mashup Pro</Link></main>;
  return <>{!admin && access.role === "admin" ? <nav className="px-4 pt-3"><Link to="/admin" className="text-sm underline">Manage users</Link></nav> : null}{children}</>;
}
