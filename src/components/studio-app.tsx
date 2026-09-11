import { Link } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { MashPanel } from "@/components/mash-panel";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { BOOTH_MODES, type BoothMode } from "@/lib/booth-mode";

export function StudioApp({ mode }: { mode: BoothMode }) {
  const user = useCurrentUser();
  const meta = BOOTH_MODES[mode];

  return (
    <div className="relative min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-transparent bg-bg">
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
      </header>

      <p className="mx-auto max-w-7xl px-4 pb-3 text-sm text-muted md:px-8 md:pb-4">
        {meta.blurb}
      </p>

      <MashPanel mode={mode} />

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
