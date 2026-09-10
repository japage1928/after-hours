import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { Toaster } from "sonner";
import { LibraryPanel } from "@/components/library-panel";
import { MashPanel } from "@/components/mash-panel";
import { PlayerStage } from "@/components/player-stage";
import { TransportBar } from "@/components/transport-bar";
import { WritePanel } from "@/components/write-panel";
import { Button } from "@/components/ui/button";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { djEngine } from "@/lib/dj-engine";
import { engine } from "@/lib/audio-engine";
import { useBooth } from "@/lib/dj-store";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

type Room = "mash" | "write";

export function StudioApp() {
  const hydrate = useStudio((s) => s.hydrate);
  const libraryOpen = useStudio((s) => s.libraryOpen);
  const [room, setRoom] = useState<Room>("mash");
  const user = useCurrentUser();

  useEffect(() => {
    hydrate();
  }, [hydrate, user?.id]);

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
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-5 pb-2 md:px-8 md:pt-8">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            Late-night studio
          </p>
          <p className="font-display text-3xl leading-none tracking-tight text-fg md:text-4xl">
            After Hours
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex rounded-md bg-surface-2 p-1 shadow-border">
            {(
              [
                ["mash", "Mash"],
                ["write", "Write"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className={cn(
                  "h-11 rounded-sm px-3 text-sm font-medium transition-colors duration-150",
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
              onClick={() => useStudio.getState().setLibraryOpen(!libraryOpen)}
            >
              <Library />
              Tape shelf
            </Button>
          ) : null}
          <AuthSlot />
        </div>
      </header>

      <p className="mx-auto max-w-7xl px-4 pb-4 text-sm text-muted md:px-8">
        {room === "mash"
          ? "Load song A and song B. Mash them into one cut."
          : "Write original songs. Explicit if you want. Two voices on one beat."}
      </p>

      {room === "mash" ? (
        <MashPanel />
      ) : (
        <>
          <div className="mx-auto grid max-w-7xl min-w-0 gap-5 px-4 pb-44 md:px-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8">
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
      />
    </div>
  );
}

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-2" />;
  }
  if (user) {
    return (
      <div className="max-w-[11rem] shrink-0 overflow-hidden [&_span]:truncate">
        <UserButton />
      </div>
    );
  }
  return (
    <Button variant="secondary" asChild>
      <Link to="/login">Sign in</Link>
    </Button>
  );
}
