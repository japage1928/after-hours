import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  getBillingCatalog,
  getMyBilling,
  startCheckout,
} from "@/lib/billing/billing-api";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

export type CatalogPlan = {
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

type Props = {
  /** Compact booth paywall vs full landing/pricing grid */
  compact?: boolean;
  className?: string;
  /** Highlight when shown as a hard paywall */
  paywall?: boolean;
};

export function PlansGrid({ compact = false, className, paywall }: Props) {
  const user = useCurrentUser();
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [stripeReady, setStripeReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entitled, setEntitled] = useState(false);

  useEffect(() => {
    void (async () => {
      const catalog = await getBillingCatalog();
      setPlans(catalog.plans as CatalogPlan[]);
      setStripeReady(catalog.stripeReady);
    })();
  }, []);

  useEffect(() => {
    if (!user || user.isDevFallback) return;
    void getMyBilling()
      .then((mine) => setEntitled(mine.entitlement.ok))
      .catch(() => setEntitled(false));
  }, [user]);

  async function buy(planId: CatalogPlan["id"]) {
    setError(null);
    if (!user || user.isDevFallback) {
      window.location.assign("/login?next=/pricing");
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

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {paywall ? (
        <div className="rounded-2xl border border-rec/35 bg-rec/10 px-4 py-3">
          <p className="font-display text-2xl text-fg">Unlock the AI booth</p>
          <p className="mt-1 text-sm text-muted">
            Load tracks for free. AI DJ planning needs a song credit or monthly
            plan — cancel anytime from Billing.
          </p>
        </div>
      ) : null}

      {!stripeReady ? (
        <p className="text-sm text-muted">
          Checkout is warming up — Stripe keys are still settling on this deploy.
        </p>
      ) : null}

      {entitled && !paywall ? (
        <p className="text-sm text-muted">You’re on a plan — keep mixing.</p>
      ) : null}

      {error ? <p className="text-sm text-rec">{error}</p> : null}

      <div
        className={cn(
          "grid gap-3",
          compact
            ? "sm:grid-cols-2"
            : "sm:grid-cols-2 lg:grid-cols-4",
        )}
      >
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border"
          >
            <div>
              <h3 className="font-display text-2xl text-fg">{plan.name}</h3>
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
                Includes {plan.usageBudgetLabel} AI DJ planning / month
              </p>
            ) : (
              <p className="text-xs text-subtle">Includes 1 AI mix credit</p>
            )}
            <Button
              className="mt-auto w-full"
              disabled={Boolean(busy) || !stripeReady}
              onClick={() => void buy(plan.id)}
            >
              {busy === plan.id
                ? "Redirecting…"
                : plan.kind === "subscription"
                  ? "Start plan"
                  : "Buy credit"}
            </Button>
          </article>
        ))}
      </div>

      {!compact ? (
        <p className="text-center text-xs text-subtle">
          Or open the full page at{" "}
          <Link to="/pricing" className="text-muted underline-offset-2 hover:text-fg hover:underline">
            /pricing
          </Link>
          . Cancel anytime under Account → Billing.
        </p>
      ) : null}
    </div>
  );
}
