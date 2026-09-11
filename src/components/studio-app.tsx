import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Toaster, toast } from "sonner";
import { StudioPanel } from "@/components/studio-panel";
import { UsageMeter } from "@/components/usage-meter";
import { NeedHelpLink } from "@/components/need-help-link";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  BOOTH_MODE_ORDER,
  BOOTH_MODES,
  type BoothMode,
} from "@/lib/booth-mode";
import { consumeCheckoutSuccessLocation } from "@/lib/checkout-return";
import { bumpUsageMeter } from "@/lib/usage-events";
import { cn } from "@/lib/utils";

export function StudioApp({ mode }: { mode: BoothMode }) {
  const user = useCurrentUser();
  const meta = BOOTH_MODES[mode];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cleaned = consumeCheckoutSuccessLocation(
      window.location.pathname,
      window.location.search,
    );
    if (!cleaned) return;
    toast.success("You're in. Generate is unlocked.");
    bumpUsageMeter();
    const ticks = [800, 2500, 6000].map((ms) =>
      window.setTimeout(() => bumpUsageMeter(), ms),
    );
    window.history.replaceState({}, "", cleaned);
    return () => ticks.forEach((id) => window.clearTimeout(id));
  }, []);

  return (
    <div className="relative min-h-dvh bg-bg text-fg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgb(196 92 74 / 0.16), transparent 70%)",
        }}
      />
      <header className="sticky top-0 z-20 border-b border-transparent bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 md:px-8 md:pt-[max(2rem,env(safe-area-inset-top))] md:pb-4">
          <div className="min-w-0">
            <Link
              to="/"
              className="text-xs font-medium tracking-widest text-muted uppercase hover:text-fg"
            >
              After Hours
            </Link>
            <p className="font-display text-[1.75rem] leading-none tracking-tight text-fg sm:text-3xl md:text-4xl">
              {meta.label}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <UsageMeter />
            <Button asChild variant="secondary" className="h-11">
              <Link to="/projects">Library</Link>
            </Button>
            <Button asChild variant="secondary" className="h-11">
              <Link to="/pricing">Plans</Link>
            </Button>
            <NeedHelpLink className="hidden px-2 sm:inline" />
            <Button asChild variant="secondary" className="h-11">
              <Link to="/">Home</Link>
            </Button>
            {user && isAdminEmail(user.primaryEmail) ? (
              <Button asChild variant="secondary" className="h-11">
                <Link to="/admin">Admin</Link>
              </Button>
            ) : null}
            <UserButton />
          </div>
        </div>
        <nav
          aria-label="Studio modes"
          className="mx-auto flex max-w-7xl gap-1 px-4 pb-3 md:px-8"
        >
          {BOOTH_MODE_ORDER.map((id) => {
            const item = BOOTH_MODES[id];
            const on = id === mode;
            return (
              <Link
                key={id}
                to={item.path}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors",
                  on
                    ? "bg-accent text-accent-fg"
                    : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <StudioPanel mode={mode} />

      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          className: "bg-surface text-fg border-line",
        }}
        offset="calc(env(safe-area-inset-top) + 12px)"
      />
    </div>
  );
}
