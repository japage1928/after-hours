import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getMyBilling } from "@/lib/billing/billing-api";
import { FREE_REMIXES_PER_MONTH } from "@/lib/billing/plans";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { USAGE_CHANGED_EVENT } from "@/lib/usage-events";
import { cn } from "@/lib/utils";

type Entitlement = {
  ok: boolean;
  songCredits: number;
  remixesUsed: number;
  remixesLimit: number;
  remixPeriod: "month" | "week" | "credit" | null;
  source?: string;
};

/**
 * Compact usage meter for the studio header — remix quota, not internal cost.
 */
export function UsageMeter() {
  const user = useCurrentUser();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  useEffect(() => {
    if (!user || user.isDevFallback) return;
    let cancelled = false;
    async function refresh() {
      try {
        const mine = await getMyBilling();
        if (!cancelled) setEntitlement(mine.entitlement);
      } catch {
        /* ignore */
      }
    }
    void refresh();
    const onBump = () => {
      void refresh();
    };
    window.addEventListener(USAGE_CHANGED_EVENT, onBump);
    return () => {
      cancelled = true;
      window.removeEventListener(USAGE_CHANGED_EVENT, onBump);
    };
  }, [user]);

  if (!user || user.isDevFallback) return null;

  const credits = entitlement?.songCredits ?? 0;
  const used = entitlement?.remixesUsed ?? 0;
  const limit = entitlement?.remixesLimit ?? FREE_REMIXES_PER_MONTH;
  const remaining = Math.max(0, limit - used);
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const period =
    entitlement?.remixPeriod === "week"
      ? "this week"
      : entitlement?.remixPeriod === "month"
        ? "this month"
        : "ready";

  return (
    <Link
      to="/pricing"
      className="hidden items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted shadow-border transition-colors hover:text-fg sm:flex"
      title="AI generate/remix quota — upgrade for weekly batches"
    >
      <span className="relative grid size-8 place-items-center" aria-hidden>
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
            strokeDashoffset={`${2 * Math.PI * 14 * (1 - (credits > 0 ? 1 : 1 - ratio))}`}
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="leading-tight">
        {credits > 0 ? (
          <>
            <span className="block font-medium text-fg">
              {credits} mix credit{credits === 1 ? "" : "s"}
            </span>
            <span className="text-subtle">Ready to mix</span>
          </>
        ) : entitlement?.ok ? (
          <>
            <span className="block font-medium text-fg">
              {remaining} left {period}
            </span>
            <span className="text-subtle">
              of {limit} AI job{limit === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <>
            <span className="block font-medium text-fg">Quota used</span>
            <span className="text-subtle">View plans</span>
          </>
        )}
      </span>
    </Link>
  );
}
