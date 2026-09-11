import { Link } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";
import { BOOTH_MODES, type BoothMode } from "@/lib/booth-mode";
import { cn } from "@/lib/utils";

export function LandingPage() {
  const user = useCurrentUser();

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg text-fg">
      <div
        aria-hidden
        className="landing-glow pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 100%, rgb(196 92 74 / 0.18), transparent 70%)",
        }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 md:px-8 md:pt-[max(2rem,env(safe-area-inset-top))]">
        <p className="font-display text-xl tracking-tight text-fg md:text-2xl">
          After Hours
        </p>
        <div className="flex items-center gap-2">
          {user ? (
            <UserButton />
          ) : (
            <Link
              to="/login"
              className="rounded-md bg-surface-2 px-3 py-2 text-sm text-fg shadow-border transition-colors hover:bg-surface"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] max-w-6xl flex-col justify-center gap-10 px-4 py-10 md:px-8 md:py-16">
        <div className="landing-rise max-w-3xl">
          <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">
            Late night
          </p>
          <h1 className="font-display mt-3 text-6xl leading-[0.92] tracking-tight text-fg sm:text-7xl md:text-8xl">
            After Hours
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted sm:text-lg">
            Two songs you own. One booth. Pick how the night goes.
          </p>
        </div>

        <div className="landing-rise-delay grid max-w-2xl gap-3 sm:grid-cols-2 sm:gap-4">
          {(Object.keys(BOOTH_MODES) as BoothMode[]).map((mode) => {
            const meta = BOOTH_MODES[mode];
            return (
              <ModeChoice
                key={mode}
                mode={mode}
                signedIn={Boolean(user)}
                title={meta.landingTitle}
                blurb={meta.landingBlurb}
                path={meta.path}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}

function ModeChoice({
  mode,
  signedIn,
  title,
  blurb,
  path,
}: {
  mode: BoothMode;
  signedIn: boolean;
  title: string;
  blurb: string;
  path: "/mashup" | "/remix";
}) {
  const className = cn(
    "group flex min-h-[9.5rem] flex-col justify-end rounded-2xl bg-surface/80 p-5 shadow-border backdrop-blur-sm transition-[transform,box-shadow,background-color] duration-200",
    "hover:bg-surface-2 hover:shadow-border-hover active:scale-[0.98]",
  );

  const body = (
    <>
      <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
        {mode}
      </p>
      <p className="font-display mt-2 text-3xl leading-none text-fg sm:text-4xl">
        {title}
      </p>
      <p className="mt-2 text-sm text-muted">{blurb}</p>
      <span className="mt-4 text-sm text-fg/80 transition-transform duration-200 group-hover:translate-x-0.5">
        Open booth →
      </span>
    </>
  );

  if (signedIn) {
    return (
      <Link to={path} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <Link to="/login" search={{ next: path }} className={className}>
      {body}
    </Link>
  );
}
