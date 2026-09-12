import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PlansGrid } from "@/components/plans-grid";
import { VideoResultPlayer } from "@/components/video-result";
import { VIDEO_ASPECTS, VIDEO_DURATIONS, VIDEO_STUDIO } from "@/lib/video-booth";
import { useVideoStudio } from "@/lib/video-store";
import type { VideoAspect } from "@/lib/grok-video";
import { cn } from "@/lib/utils";

export function VideoPanel() {
  const hydrate = useVideoStudio((s) => s.hydrate);
  const status = useVideoStudio((s) => s.status);
  const statusText = useVideoStudio((s) => s.statusText);
  const error = useVideoStudio((s) => s.error);
  const needsUpgrade = useVideoStudio((s) => s.needsUpgrade);
  const capabilities = useVideoStudio((s) => s.capabilities);
  const prompt = useVideoStudio((s) => s.prompt);
  const setPrompt = useVideoStudio((s) => s.setPrompt);
  const durationSec = useVideoStudio((s) => s.durationSec);
  const setDurationSec = useVideoStudio((s) => s.setDurationSec);
  const aspectRatio = useVideoStudio((s) => s.aspectRatio);
  const setAspectRatio = useVideoStudio((s) => s.setAspectRatio);
  const result = useVideoStudio((s) => s.result);
  const generate = useVideoStudio((s) => s.generate);
  const downloadResult = useVideoStudio((s) => s.downloadResult);
  const lastLibrarySave = useVideoStudio((s) => s.lastLibrarySave);
  const navigate = useNavigate();

  const busy = status === "generating";
  const videoBlocked = Boolean(capabilities && !capabilities.video);
  const ready = prompt.trim().length >= 2;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!lastLibrarySave) return;
    toast.success("Saved to your library", {
      description: lastLibrarySave.title,
      action: {
        label: "Open",
        onClick: () => {
          void navigate({ to: "/projects" });
        },
      },
    });
  }, [lastLibrarySave, navigate]);

  const cta = busy
    ? VIDEO_STUDIO.actionBusy
    : ready
      ? videoBlocked
        ? "AI video unavailable"
        : "Generate clip"
      : VIDEO_STUDIO.actionIdle;

  return (
    <div className="mx-auto flex max-w-3xl min-w-0 flex-col gap-4 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:gap-5 md:px-8">
      <section className="flex min-w-0 flex-col gap-2 rounded-2xl bg-surface p-4 shadow-border sm:gap-2 md:p-5">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          {VIDEO_STUDIO.eyebrow}
        </p>
        <h1 className="font-display text-[2rem] leading-none tracking-tight text-fg sm:text-4xl">
          {VIDEO_STUDIO.title}
        </h1>
        <p className="text-sm text-muted">{VIDEO_STUDIO.blurb}</p>
        {capabilities ? (
          <p className="text-xs text-subtle">{capabilities.engineLabel}</p>
        ) : null}
        {capabilities && !capabilities.video ? (
          <div className="mt-2 rounded-xl border border-line bg-bg/60 px-3 py-3">
            <p className="text-sm text-fg">
              {capabilities.owner
                ? "Video is offline until XAI_API_KEY is set."
                : "AI video is temporarily unavailable."}
            </p>
            {capabilities.setupHint ? (
              <p className="mt-1 text-xs text-muted">{capabilities.setupHint}</p>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Songs booth still works — Generate, Remix, and Mashup are a
                separate studio.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-border md:p-5">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-widest text-muted uppercase">
            {VIDEO_STUDIO.briefLabel}
          </span>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={VIDEO_STUDIO.briefPlaceholder}
            maxLength={2000}
            className="min-h-28"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {VIDEO_STUDIO.presets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPrompt(t.prompt)}
              className={cn(
                "rounded-md bg-surface-2 px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg",
                prompt === t.prompt && "bg-accent text-accent-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            Length
          </p>
          {VIDEO_DURATIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDurationSec(d.id)}
              className={cn(
                "rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-muted hover:text-fg",
                durationSec === d.id && "bg-accent text-accent-fg",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            Aspect
          </p>
          {VIDEO_ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAspectRatio(a.id as VideoAspect)}
              className={cn(
                "rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-muted hover:text-fg",
                aspectRatio === a.id && "bg-accent text-accent-fg",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>

      <p className="px-1 text-xs leading-relaxed text-subtle sm:text-sm">
        {VIDEO_STUDIO.engineLine} Your first two AI jobs this month are
        included (shared with Generate / Remix). Grok Imagine bills about
        $0.08/sec — an 8s clip is ~$0.64.
      </p>

      <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-border md:p-5">
        {busy ? (
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="studio-progress h-full w-1/3 rounded-full bg-accent" />
          </div>
        ) : null}
        <p className="text-sm text-muted">{statusText}</p>
        {error ? <p className="text-sm text-rec">{error}</p> : null}
        {needsUpgrade ? (
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-bg/60 p-4">
            <PlansGrid compact paywall />
          </div>
        ) : null}
      </section>

      {result ? (
        <VideoResultPlayer result={result} onDownload={downloadResult} />
      ) : null}

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-8">
          <Button
            size="lg"
            className="h-12 min-w-0 flex-1"
            onClick={() => void generate()}
            disabled={busy || !ready || videoBlocked}
          >
            <Sparkles />
            <span className="truncate">{cta}</span>
          </Button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </footer>
    </div>
  );
}
