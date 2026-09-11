import { Link } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { MashPanel } from "@/components/mash-panel";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export function StudioApp() {
  const user = useCurrentUser();

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-transparent bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 md:px-8 md:pt-[max(2rem,env(safe-area-inset-top))] md:pb-4">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-widest text-muted uppercase">
              Remix booth
            </p>
            <p className="font-display text-[1.75rem] leading-none tracking-tight text-fg sm:text-3xl md:text-4xl">
              After Hours
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
        Load song A and song B. Remix them into one cut.
      </p>

      <MashPanel />

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
