import { Link } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";
import { BOOTH_MODE_ORDER, BOOTH_MODES, type BoothMode } from "@/lib/booth-mode";
import { PlansGrid } from "@/components/plans-grid";
import { NeedHelpLink } from "@/components/need-help-link";
import { cn } from "@/lib/utils";

export function LandingPage() {
  const user = useCurrentUser();

  return (
    <div className="relative bg-bg text-fg">
      <section className="relative min-h-dvh overflow-hidden">
        <img
          src="/after-hours-hero.jpg"
          alt=""
          className="landing-hero-image absolute inset-0 size-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-bg/55 via-bg/70 to-bg"
        />
        <div
          aria-hidden
          className="landing-glow pointer-events-none absolute inset-0 opacity-70"
        />

        <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 md:px-8 md:pt-[max(2rem,env(safe-area-inset-top))]">
          <p className="font-display text-xl tracking-tight text-fg md:text-2xl">
            After Hours
          </p>
          <div className="flex items-center gap-2">
            <Link
              to="/pricing"
              className="rounded-md bg-surface-2/90 px-3 py-2 text-sm text-fg shadow-border backdrop-blur-sm transition-colors hover:bg-surface"
            >
              Plans
            </Link>
            <NeedHelpLink className="rounded-md bg-surface-2/90 px-3 py-2 text-sm no-underline hover:bg-surface" muted={false} />
            {user ? (
              <UserButton />
            ) : (
              <Link
                to="/login"
                className="rounded-md bg-surface-2/90 px-3 py-2 text-sm text-fg shadow-border backdrop-blur-sm transition-colors hover:bg-surface"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] max-w-6xl flex-col justify-end gap-8 px-4 pb-14 pt-10 md:justify-center md:px-8 md:pb-20 md:pt-16">
          <div className="landing-rise max-w-3xl">
            <h1 className="font-display text-6xl leading-[0.92] tracking-tight text-fg sm:text-7xl md:text-8xl">
              After Hours
            </h1>
            <p className="mt-5 max-w-lg text-base text-fg/80 sm:text-lg">
              AI song, remix, or mashup in the browser. Generate a full track
              from a prompt, rebuild one you own onto a new beat, or mash beats
              with lyrics — then play and download.
            </p>
          </div>

          <div className="landing-rise-delay grid max-w-4xl gap-3 sm:grid-cols-3 sm:gap-4">
            {BOOTH_MODE_ORDER.map((mode) => {
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
      </section>

      <section
        id="plans"
        className="relative border-t border-line/60 bg-bg px-4 py-16 md:px-8 md:py-24"
      >
        <div className="landing-plans-rise mx-auto max-w-6xl">
          <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">
            Plans
          </p>
          <h2 className="font-display mt-3 text-4xl text-fg md:text-5xl">
            Two AI songs free. Weekly batches when you go further.
          </h2>
          <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
            Every account gets 2 AI generates or remixes per month — enough to
            finish a real track on visit one. Paid plans unlock weekly batches
            that reset every week. Mashup of two owned tracks is included — it
            runs on your device.
          </p>
          <div className="mt-10">
            <PlansGrid />
          </div>
        </div>
      </section>
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
  path: "/generate" | "/mashup" | "/remix";
}) {
  const className = cn(
    "group flex min-h-[8.5rem] flex-1 flex-col justify-end rounded-2xl bg-bg/55 p-5 shadow-border backdrop-blur-md transition-[transform,background-color] duration-200",
    "hover:bg-bg/75 active:scale-[0.98]",
  );

  const body = (
    <>
      <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
        {mode}
      </p>
      <p className="font-display mt-2 text-3xl leading-none text-fg sm:text-4xl">
        {title}
      </p>
      <p className="mt-2 text-sm text-fg/70">{blurb}</p>
      <span className="mt-4 text-sm text-fg/90 transition-transform duration-200 group-hover:translate-x-0.5">
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
