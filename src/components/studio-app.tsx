import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { Toaster } from "sonner";
import { LibraryPanel } from "@/components/library-panel";
import { MashPanel } from "@/components/mash-panel";
import { PlayerStage } from "@/components/player-stage";
import { TransportBar } from "@/components/transport-bar";
import { WritePanel } from "@/components/write-panel";
import { UsageMeter } from "@/components/usage-meter";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/auth/admin";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { djEngine } from "@/lib/dj-engine";
import { engine } from "@/lib/audio-engine";
import { useBooth } from "@/lib/dj-store";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

type Room = "mash" | "write";

export function StudioApp() {
  const hydrate = useStudio((s) => s.hydrate);
  const libraryOpen = useStudio((s) => s.libraryOpen);
  const user = useCurrentUser();
  const [room, setRoom] = useState<Room>("mash");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const go = (next: Room) => {
    if (next === room) return;
    if (next === "mash") {
      engine.stop();
      useStudio.getState().stop();
    } else {
      djEngine.stopAll();
      useBooth.getState().stopMix();
    }
    setRoom(next);
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-transparent bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 md:px-8 md:pt-[max(2rem,env(safe-area-inset-top))] md:pb-4">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-widest text-muted uppercase">
              Late-night studio
            </p>
            <p className="font-display text-[1.75rem] leading-none tracking-tight text-fg sm:text-3xl md:text-4xl">
              After Hours
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className="flex rounded-md bg-surface-2 p-1 shadow-border"
              role="tablist"
              aria-label="Studio rooms"
            >
              {(
                [
                  ["mash", "Mash"],
                  ["write", "Write"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={room === id}
                  onClick={() => go(id)}
                  className={cn(
                    "h-11 min-w-[4.5rem] rounded-sm px-3 text-sm font-medium transition-colors duration-150",
                    room === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {room === "write" ? (
              <Button
                variant="secondary"
                className="h-11"
                onClick={() => useStudio.getState().setLibraryOpen(!libraryOpen)}
              >
                <Library />
                <span className="hidden sm:inline">Tape shelf</span>
                <span className="sm:hidden">Shelf</span>
              </Button>
            ) : null}
            {user && isAdminEmail(user.primaryEmail) ? (
              <Button asChild variant="secondary" className="h-11">
                <Link to="/admin">Admin</Link>
              </Button>
            ) : null}
            <UsageMeter />
            <Button asChild variant="secondary" className="h-11">
              <Link to="/pricing">Plans</Link>
            </Button>
            <UserButton />
          </div>
        </div>
      </header>

      <p className="mx-auto max-w-7xl px-4 pb-3 text-sm text-muted md:px-8 md:pb-4">
        {room === "mash"
          ? "Load song A and song B. Mash them into one cut."
          : "Write original songs. Explicit if you want. Two voices on one beat."}
      </p>

      {room === "mash" ? (
        <MashPanel />
      ) : (
        <>
          <div className="mx-auto grid max-w-7xl min-w-0 gap-4 px-4 pb-[calc(11rem+env(safe-area-inset-bottom))] sm:gap-5 md:px-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8 lg:pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
            <WritePanel />
            <PlayerStage />
          </div>
          <TransportBar />
          <LibraryPanel />
        </>
      )}

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
