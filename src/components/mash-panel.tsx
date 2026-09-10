import { useEffect, useRef } from "react";
import { Play, Shuffle, Square, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Visualizer } from "@/components/visualizer";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { MixJob } from "@/lib/dj-api";
import { djEngine, type DeckId } from "@/lib/dj-engine";
import { useBooth } from "@/lib/dj-store";
import { cn, formatTime } from "@/lib/utils";

const JOBS: { id: MixJob; label: string; blurb: string; title: string }[] = [
  { id: "stems", label: "Stems", title: "Instrumental A + vocals B", blurb: "Load a separate instrumental and vocal track. Four-bar intro and outro. Automatic vocal separation is not connected yet." },
  {
    id: "mashup",
    label: "DJ blend",
    title: "Song A × Song B",
    blurb: "Crossfade two full songs. This mode does not isolate vocals.",
  },
  {
    id: "remix",
    label: "Remix",
    title: "One song, remixed",
    blurb: "One track. New tempo, darker intro, a drop.",
  },
  {
    id: "both",
    label: "Both",
    title: "Mashup + remix",
    blurb: "Two tracks mashed, then restyled as a remix.",
  },
];

function cutTitle(nameA: string, nameB: string) {
  if (nameB === "remix") return `${nameA} remix`;
  return `${nameA} × ${nameB}`;
}

export function MashPanel() {
  const hydrate = useBooth((s) => s.hydrate);
  const job = useBooth((s) => s.job);
  const setJob = useBooth((s) => s.setJob);
  const prompt = useBooth((s) => s.prompt);
  const setPrompt = useBooth((s) => s.setPrompt);
  const status = useBooth((s) => s.status);
  const statusText = useBooth((s) => s.statusText);
  const error = useBooth((s) => s.error);
  const cue = useBooth((s) => s.cue);
  const playing = useBooth((s) => s.playing);
  const dropMix = useBooth((s) => s.dropMix);
  const playMash = useBooth((s) => s.playMash);
  const stopMix = useBooth((s) => s.stopMix);
  const recents = useBooth((s) => s.recents);
  const deckA = useBooth((s) => s.deckA);
  const deckB = useBooth((s) => s.deckB);
  const timeA = useBooth((s) => s.timeA);
  const user = useCurrentUser();
  const hasOutput = useBooth((s) => s.hasOutput);
  const download = useBooth((s) => s.download);
  const vocalSemitones = useBooth((s) => s.vocalSemitones);
  const setVocalSemitones = useBooth((s) => s.setVocalSemitones);
  const busy = status === "loading" || status === "planning" || status === "rendering";
  const remix = job === "remix";
  const ready = remix ? deckA.hasTrack : deckA.hasTrack && deckB.hasTrack;
  const current = JOBS.find((j) => j.id === job) ?? JOBS[0];
  const action =
    (status === "planning" || status === "rendering")
      ? remix
        ? "Producing remix…"
        : job === "both"
          ? "Producing mash + remix…"
          : "Producing mashup…"
      : ready
        ? remix
          ? `Remix ${deckA.name}`
          : job === "both"
            ? `Mash + remix ${deckA.name} × ${deckB.name}`
            : `Mash ${deckA.name} × ${deckB.name}`
        : remix
          ? "Load a song"
          : "Load both songs";

  useEffect(() => {
    void hydrate();
  }, [hydrate, user?.id]);

  return (
    <div className="mx-auto flex max-w-3xl min-w-0 flex-col gap-5 px-4 pb-44 md:px-8">
      <section className="flex min-w-0 flex-col gap-4 rounded-2xl bg-surface p-4 shadow-border md:p-6">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          Mix
        </p>
        <h1 className="font-display text-4xl leading-none tracking-tight text-fg md:text-5xl">
          {current.title}
        </h1>
        <p className="text-sm text-muted">{current.blurb}</p>
        <div className="flex rounded-md bg-surface-2 p-1 shadow-border">
          {JOBS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => setJob(item.id)}
              className={cn(
                "h-11 flex-1 rounded-sm px-2 text-sm font-medium transition-colors duration-150",
                job === item.id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className={cn("grid min-w-0 gap-4", remix ? "grid-cols-1" : "sm:grid-cols-2")}>
        <SongSlot id="a" label={remix ? "Song" : job === "stems" ? "Instrumental A" : "Song A"} />
        {remix ? null : <SongSlot id="b" label={job === "stems" ? "Vocals B" : "Song B"} />}
      </div>

      {job === "stems" ? <label className="text-sm text-muted">Vocal pitch shift (semitones)
        <input type="number" min={-12} max={12} step={1} value={vocalSemitones} disabled={busy}
          onChange={(e) => setVocalSemitones(Math.max(-12, Math.min(12, Number(e.target.value) || 0)))}
          className="ml-3 w-20 rounded bg-surface p-2" />
        <p>Use the original songs’ BPM below. Vocal-only BPM detection can be unreliable. Adjust pitch by ear; automatic key matching is not available.</p>
      </label> : null}
      <label className="flex min-w-0 flex-col gap-2 rounded-2xl bg-surface p-4 shadow-border md:p-5">
        <span className="text-xs font-medium tracking-widest text-muted uppercase">
          Direction
        </span>
        <textarea
          disabled={busy || job === "stems"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder={
            remix
              ? "Club remix, heavier kick, open the drop."
              : job === "both"
                ? "Late-night mash, then remix the blend."
                : "Smooth club blend. Keep the kick."
          }
          className="min-h-16 w-full resize-none rounded-md border-0 bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-subtle"
        />
      </label>

      <section className="flex min-w-0 flex-col gap-4 rounded-2xl bg-surface p-4 shadow-border md:p-5">
        <Button
          size="lg"
          className="w-full"
          onClick={() => void dropMix()}
          disabled={busy || !ready}
        >
          <Shuffle />
          {action}
        </Button>
        <p className="text-sm text-muted" role="status">{statusText}</p>
        {hasOutput ? <Button onClick={download} variant="secondary">Download WAV</Button> : null}
        {error ? <p className="text-sm text-rec">{error}</p> : null}
        {cue ? (
          <p className="font-display text-xl text-fg/90 italic">{cue}</p>
        ) : null}
        <div className="overflow-hidden rounded-lg bg-bg px-3 py-3">
          <Visualizer
            className="h-28 md:h-36"
            getAnalyser={() => djEngine.getAnalyser()}
            isActive={() => djEngine.isPlaying()}
          />
        </div>
        <p className="text-xs tabular-nums text-subtle">
          {formatTime(timeA)}
          {playing ? (remix ? " · in the remix" : " · in the mash") : ""}
        </p>
      </section>

      {recents.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-border md:p-5">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            Recent mix notes (audio is not saved)
          </p>
          <ul className="flex flex-col gap-2">
            {recents.slice(0, 8).map((cut) => (
              <li key={cut.id} className="min-w-0">
                <p className="truncate text-sm text-fg">
                  {cutTitle(cut.nameA, cut.nameB)}
                </p>
                {cut.cue ? (
                  <p className="truncate text-xs text-muted italic">{cut.cue}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-8">
          <Button
            size="play"
            aria-label={playing ? "Stop playback" : "Play"}
            disabled={busy || !ready}
            onClick={() => {
              if (playing) stopMix();
              else void playMash();
            }}
          >
            {playing ? (
              <Square className="size-5 fill-current" />
            ) : (
              <Play className="ml-0.5 size-5 fill-current" />
            )}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Stop"
            onClick={stopMix}
            className="size-11"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
          <p className="min-w-0 truncate text-sm text-muted">
            {ready
              ? remix
                ? `${deckA.name} remix`
                : `${deckA.name} × ${deckB.name}`
              : current.title}
          </p>
        </div>
        <div className="dock-safe" />
      </footer>
    </div>
  );
}

function SongSlot({ id, label }: { id: DeckId; label: string }) {
  const deck = useBooth((s) => (id === "a" ? s.deckA : s.deckB));
  const loadFile = useBooth((s) => s.loadFile);
  const setTiming = useBooth((s) => s.setTiming);
  const busy = useBooth((s) => ["loading", "planning", "rendering"].includes(s.status));
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !busy) void loadFile(id, file);
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-border md:p-5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          {label}
        </p>
        {deck.hasTrack ? <Badge>{Math.round(deck.bpm)} BPM</Badge> : <Badge>Empty</Badge>}
      </div>
      <h2 className="font-display truncate text-2xl leading-tight text-fg">
        {deck.hasTrack ? deck.name : "Drop a track"}
      </h2>
      <button
        type="button"
        className="flex h-14 w-full items-end gap-px overflow-hidden rounded-md bg-bg px-1 py-1"
        onClick={() => inputRef.current?.click()}
        aria-label={`Load ${label}`}
      >
        {deck.peaks.map((p, i) => (
          <span
            key={i}
            className={cn("w-full rounded-sm bg-fg/70")}
            style={{ height: `${Math.max(10, Math.round(p * 100))}%` }}
          />
        ))}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {deck.hasTrack ? <div className="flex gap-3 text-xs text-muted">
        <label>Original BPM<input aria-label={`${label} BPM`} type="number" min={70} max={180} step={0.5} value={deck.bpm} disabled={busy}
          onChange={(e) => setTiming(id, Number(e.target.value) || 120, deck.offset)} className="mt-1 w-full rounded bg-bg p-2" /></label>
        <label>Cue seconds<input aria-label={`${label} cue seconds`} type="number" min={0} max={deck.duration - 0.1} step={0.05} value={deck.offset} disabled={busy}
          onChange={(e) => setTiming(id, deck.bpm, Number(e.target.value) || 0)} className="mt-1 w-full rounded bg-bg p-2" /></label>
      </div> : null}
      <Button disabled={busy} variant="secondary" onClick={() => inputRef.current?.click()}>
        <Upload />
        Load {label}
      </Button>
    </section>
  );
}
