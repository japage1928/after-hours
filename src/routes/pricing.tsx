import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getBillingCatalog,
  getMyBilling,
  startBillingPortal,
  startCheckout,
} from "@/lib/billing/billing-api";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

type CatalogPlan = {
  id: "song" | "basic" | "plus" | "pro";
  name: string;
  blurb: string;
  priceCents: number;
  priceLabel: string;
  kind: "one_time" | "subscription";
  usageBudgetCents: number;
  usageBudgetLabel: string | null;
  songCredits: number;
};

function PricingPage() {
  const user = useCurrentUser();
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [stripeReady, setStripeReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<{
    usageUsedCents: number;
    usageBudgetCents: number;
    songCredits: number;
    planId?: string | null;
    ok: boolean;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const catalog = await getBillingCatalog();
      setPlans(catalog.plans as CatalogPlan[]);
      setStripeReady(catalog.stripeReady);
    })();
  }, []);

  useEffect(() => {
    if (!user || user.isDevFallback) return;
    void (async () => {
      try {
        const mine = await getMyBilling();
        setEntitlement(mine.entitlement);
      } catch {
        /* signed-out race */
      }
    })();
  }, [user]);

  async function buy(planId: CatalogPlan["id"]) {
    setError(null);
    if (!user || user.isDevFallback) {
      window.location.assign("/login");
      return;
    }
    setBusy(planId);
    try {
      const { url } = await startCheckout({ data: { planId } });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy(null);
    }
  }

  async function openPortal() {
    setError(null);
    setBusy("portal");
    try {
      const { url } = await startBillingPortal();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            After Hours
          </p>
          <h1 className="font-display text-4xl text-fg md:text-5xl">Pricing</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            One song is $2.99. Monthly plans keep AI usage at or under 30% of
            what you pay — Basic $3, Plus $6, Pro $9.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/">Studio</Link>
          </Button>
          {user && !user.isDevFallback ? (
            <Button
              variant="secondary"
              disabled={busy === "portal" || !stripeReady}
              onClick={() => void openPortal()}
            >
              Manage billing
            </Button>
          ) : null}
        </div>
      </header>

      {!stripeReady ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted shadow-border">
          Stripe keys are not on this deploy yet. Checkout will unlock once{" "}
          <code className="text-fg">STRIPE_SECRET_KEY</code> and price IDs are
          set.
        </p>
      ) : null}

      {entitlement ? (
        <p className="text-sm text-muted">
          Your booth:{" "}
          {entitlement.ok
            ? entitlement.songCredits > 0
              ? `${entitlement.songCredits} song credit(s)`
              : `${(entitlement.usageUsedCents / 100).toFixed(2)} / ${(entitlement.usageBudgetCents / 100).toFixed(2)} usage this period`
            : "no active plan — pick one below"}
        </p>
      ) : null}

      {error ? <p className="text-sm text-rec">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <section
            key={plan.id}
            className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border"
          >
            <div>
              <h2 className="font-display text-2xl text-fg">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted">{plan.blurb}</p>
            </div>
            <p className="font-display text-3xl text-fg">
              {plan.priceLabel}
              {plan.kind === "subscription" ? (
                <span className="text-base text-muted"> / mo</span>
              ) : null}
            </p>
            {plan.usageBudgetLabel ? (
              <p className="text-xs text-subtle">
                AI usage cap {plan.usageBudgetLabel}/mo (30%)
              </p>
            ) : (
              <p className="text-xs text-subtle">Includes 1 song credit</p>
            )}
            <Button
              className="mt-auto w-full"
              disabled={Boolean(busy) || !stripeReady}
              onClick={() => void buy(plan.id)}
            >
              {busy === plan.id
                ? "Redirecting…"
                : plan.kind === "subscription"
                  ? "Subscribe"
                  : "Buy song"}
            </Button>
          </section>
        ))}
      </div>
    </div>
  );
}
