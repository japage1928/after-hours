import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlansGrid } from "@/components/plans-grid";
import { startBillingPortal } from "@/lib/billing/billing-api";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await startBillingPortal();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open portal");
      setBusy(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancel") {
      setError("Checkout canceled — pick a plan whenever you’re ready.");
    }
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            After Hours
          </p>
          <h1 className="font-display text-4xl text-fg md:text-5xl">Plans</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            The booth opens free. AI DJ planning uses a mix credit or a monthly
            plan with included usage. Cancel anytime from Billing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <Link to="/">Home</Link>
          </Button>
          {user && !user.isDevFallback ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void openPortal()}
            >
              {busy ? "Opening…" : "Manage billing"}
            </Button>
          ) : null}
          {user ? <UserButton /> : null}
        </div>
      </header>

      {error ? <p className="text-sm text-rec">{error}</p> : null}

      <PlansGrid paywall />
    </div>
  );
}
