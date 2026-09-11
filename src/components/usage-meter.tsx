import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getMyBilling } from "@/lib/billing/billing-api";
import { formatUsd } from "@/lib/billing/plans";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

type Entitlement = {
  ok: boolean;
  songCredits: number;
  usageUsedCents: number;
  usageBudgetCents: number;
};

/**
 * Compact usage meter for the studio header — shows included AI without
 * exposing internal margin math.
 */
export function UsageMeter() {
  const user = useCurrentUser();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  useEffect(() => {
    if (!user || user.isDevFallback) return;
    let cancelled = false;
    void (async () => {
      try {
        const mine = await getMyBilling();
        if (!cancelled) setEntitlement(mine.entitlement);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || user.isDevFallback) return null;

  const credits = entitlement?.songCredits ?? 0;
  const used = entitlement?.usageUsedCents ?? 0;
  const budget = entitlement?.usageBudgetCents ?? 0;
  const ratio = budget > 0 ? Math.min(1, used / budget) : 0;

  return (
    <Link
      to="/pricing"
      className="hidden items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted shadow-border transition-colors hover:text-fg sm:flex"
      title="AI DJ usage — upgrade when you need more planning"
    >
      <span
        className="relative grid size-8 place-items-center"
        aria-hidden
      >
        <svg viewBox="0 0 36 36" className="size-8 -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            className="stroke-line"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            className={cn(
              "stroke-accent transition-[stroke-dashoffset] duration-500",
            )}
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 14}`}
            strokeDashoffset={`${2 * Math.PI * 14 * (1 - (credits > 0 ? 1 : ratio))}`}
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="leading-tight">
        {credits > 0 ? (
          <>
            <span className="block font-medium text-fg">
              {credits} song credit{credits === 1 ? "" : "s"}
            </span>
            <span className="text-subtle">Ready to mix</span>
          </>
        ) : budget > 0 ? (
          <>
            <span className="block font-medium text-fg">
              {formatUsd(Math.max(0, budget - used))} left
            </span>
            <span className="text-subtle">
              of {formatUsd(budget)} AI this month
            </span>
          </>
        ) : (
          <>
            <span className="block font-medium text-fg">Unlock AI DJ</span>
            <span className="text-subtle">View plans</span>
          </>
        )}
      </span>
    </Link>
  );
}
