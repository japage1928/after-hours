import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Visualizer } from "@/components/visualizer";
import { genreById } from "@/lib/genres";
import { currentSection, songVoices, useStudio } from "@/lib/store";
import { vocalistById } from "@/lib/vocalists";
import { cn } from "@/lib/utils";

export function PlayerStage() {
  const song = useStudio((s) => s.song);
  const beats = useStudio((s) => s.beats);
  const status = useStudio((s) => s.status);
  const statusText = useStudio((s) => s.statusText);
  const vocalsReady = useStudio((s) => s.vocalsReady);
  const loc = currentSection(song, beats);

  if (!song) {
    return (
      <section className="flex min-h-72 flex-col justify-end rounded-2xl bg-surface p-6 shadow-border">
        <p className="text-muted">Write a cut. It plays here.</p>
      </section>
    );
  }

  const lines = (loc?.section.lyrics ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const progress = loc && loc.duration > 0 ? loc.local / loc.duration : 0;
  const activeLine = lines.length ? Math.min(lines.length - 1, Math.floor(progress * lines.length)) : -1;

  return (
    <section className="flex min-h-96 min-w-0 flex-col rounded-2xl bg-surface p-4 shadow-border md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          Now playing
        </p>
        {song.explicit ? <Badge tone="rec">Explicit</Badge> : <Badge>Clean</Badge>}
        {song.mode === "mashup" ? <Badge tone="accent">Mashup</Badge> : null}
      </div>

      <h1 className="font-display mt-3 text-4xl leading-none tracking-tight text-fg md:text-6xl">
        {song.title}
      </h1>
      <p className="mt-2 text-sm text-muted md:text-base">
        {songVoices(song)}
        <span className="text-subtle"> · </span>
        {genreById(song.genre).label}
        <span className="text-subtle"> · </span>
        <span className="tabular-nums">{song.bpm} BPM</span>
        <span className="text-subtle"> · </span>
        {song.key}
      </p>
      {song.subtitle ? (
        <p className="font-display mt-1 text-lg text-fg/80 italic">{song.subtitle}</p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg bg-bg px-3 py-3 md:px-5">
        <Visualizer />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs tracking-wide text-subtle uppercase">
          {loc?.section.label ?? "—"}
          {loc ? ` · ${vocalistById(loc.section.vocalistId).name}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted">{statusText}</p>
          {status !== "writing" &&
          status !== "rendering" &&
          song.sections.some((s) => s.lyrics.trim() && !vocalsReady[s.id]) ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void useStudio.getState().renderCurrentVocals()}
            >
              Pull vocals
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 min-h-40">
        {lines.length === 0 ? (
          <p className="text-sm text-subtle">Instrumental bed.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {lines.map((line, i) => (
              <li
                key={`${loc?.section.id}-${i}`}
                className={cn(
                  "text-sm transition-colors duration-150 md:text-base",
                  i === activeLine ? "text-fg" : "text-subtle",
                )}
              >
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
        {song.sections.map((section) => (
          <span
            key={section.id}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs",
              loc?.section.id === section.id
                ? "bg-accent text-accent-fg"
                : "bg-surface-2 text-muted",
            )}
          >
            {section.label}
            {section.lyrics && vocalsReady[section.id] ? " · vox" : ""}
          </span>
        ))}
        {status === "rendering" ? (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
            Rendering voices
          </span>
        ) : null}
      </div>
    </section>
  );
}
