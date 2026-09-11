import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/support";

export const Route = createFileRoute("/help")({
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            After Hours
          </p>
          <h1 className="font-display text-4xl text-fg md:text-5xl">Need help?</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Three booths: Generate an AI song, remix one you own, or mash beats
            with lyrics. Generation is ACE-Step — not Suno.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link to="/">Home</Link>
        </Button>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border">
        <h2 className="font-display text-2xl text-fg">Try a mode</h2>
        <ul className="flex flex-col gap-3 text-sm text-muted">
          <li>
            <Link to="/generate" className="font-medium text-fg underline-offset-4 hover:underline">
              Generate
            </Link>
            {" — "}
            prompt + style, then play and download. Needs ACE-Step on this
            deploy. Uses free AI quota.
          </li>
          <li>
            <Link to="/remix" className="font-medium text-fg underline-offset-4 hover:underline">
              Remix
            </Link>
            {" — "}
            one owned track onto a new beat. AI remix uses quota; a labeled
            local drum-bed still finishes if ACE-Step isn’t on.
          </li>
          <li>
            <Link to="/mashup" className="font-medium text-fg underline-offset-4 hover:underline">
              Mashup
            </Link>
            {" — "}
            beats × lyrics you own. Runs in the browser, no AI quota. You can
            mash lyrics over a labeled local preview beat if you only have
            vocals.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border">
        <h2 className="font-display text-2xl text-fg">Plans & library</h2>
        <p className="text-sm text-muted">
          Every account includes two AI generates or remixes per month. Mashups
          are included. Finished tracks save to{" "}
          <Link to="/projects" className="text-fg underline-offset-4 hover:underline">
            Library
          </Link>{" "}
          on this device — remix them or try another style from there.
        </p>
        <p className="text-sm text-muted">
          Paywall only appears after those free AI jobs are used. Cancel anytime
          from Billing.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-border">
        <h2 className="font-display text-2xl text-fg">Email us</h2>
        <p className="text-sm text-muted">
          Stuck on signup, a failed generate, or a file that won’t load? Write{" "}
          <a
            href={supportMailto()}
            className="text-fg underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          . Ticket tracking may land separately — this inbox is enough to get
          help.
        </p>
        <Button asChild className="w-fit">
          <a href={supportMailto()}>Email support</a>
        </Button>
      </section>
    </div>
  );
}
