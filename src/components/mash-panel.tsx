import { useEffect, useId, useRef, useState } from "react";
import { Pause, Play, Shuffle, Square, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Visualizer } from "@/components/visualizer";
import { AUDIO_FILE_ACCEPT } from "@/lib/audio-file";
import { djEngine, type DeckId } from "@/lib/dj-engine";
import { useBooth } from "@/lib/dj-store";
import { cn, formatTime } from "@/lib/utils";

export function MashPanel() {
  const hydrate = useBooth((s) => s.hydrate);
  const status = useBooth((s) => s.status);
  const statusText = useBooth((s) => s.statusText);
  const error = useBooth((s) => s.error);
  const cue = useBooth((s) => s.cue);
  const playing = useBooth((s) => s.playing);
  const dropMix = useBooth((s) => s.dropMix);
  const playMash = useBooth((s) => s.playMash);
  const stopMix = useBooth((s) => s.stopMix);
  const deckA = useBooth((s) => s.deckA);
  const deckB = useBooth((s) => s.deckB);
  const timeA = useBooth((s) => s.timeA);
  const busy = status === "loading" || status === "planning";
  const ready = deckA.hasTrack && deckB.hasTrack;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="mx-auto flex max-w-3xl min-w-0 flex-col gap-4 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:gap-5 md:px-8">
      <section className="flex min-w-0 flex-col gap-2 rounded-2xl bg-surface p-4 shadow-border sm:gap-3 md:p-6">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          Mashup
        </p>
        <h1 className="font-display text-[2rem] leading-none tracking-tight text-fg sm:text-4xl md:text-5xl">
          Song A × Song B
        </h1>
        <p className="text-sm text-muted">
          Load two tracks you have the right to mix. We beat-match them into one cut.
        </p>
      </section>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4">
        <SongSlot id="a" label="Song A" />
        <SongSlot id="b" label="Song B" />
      </div>

      <p className="px-1 text-xs leading-relaxed text-subtle sm:text-sm">
        On iPhone: tap Choose, then pick an M4A or MP3 from Files, Downloads, or Voice Memos.
        Apple Music catalog tracks can’t be uploaded.
      </p>

      <section className="flex min-w-0 flex-col gap-4 rounded-2xl bg-surface p-4 shadow-border md:p-5">
        <Button
          size="lg"
          className="h-12 w-full sm:h-12"
          onClick={() => void dropMix()}
          disabled={busy || !ready}
        >
          <Shuffle />
          {status === "planning"
            ? "Mashing…"
            : ready
              ? `Mash ${deckA.name} × ${deckB.name}`
              : "Load both songs"}
        </Button>
        <p className="text-sm text-muted">{statusText}</p>
        {error ? <p className="text-sm text-rec">{error}</p> : null}
        {cue ? (
          <p className="font-display text-xl text-fg/90 italic">{cue}</p>
        ) : null}
        <div className="overflow-hidden rounded-lg bg-bg px-3 py-3">
          <Visualizer
            className="h-24 sm:h-28 md:h-36"
            getAnalyser={() => djEngine.getAnalyser()}
            isActive={() => djEngine.isPlaying()}
          />
        </div>
        <p className="text-xs tabular-nums text-subtle">
          {formatTime(timeA)}
          {playing ? " · in the mash" : ""}
        </p>
      </section>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-8">
          <Button
            size="play"
            aria-label={playing ? "Pause mash" : "Play mash"}
            disabled={!ready}
            onClick={() => {
              if (playing) stopMix();
              else void playMash();
            }}
          >
            {playing ? (
              <Pause className="size-5 fill-current" />
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
            {ready ? `${deckA.name} × ${deckB.name}` : "Song A × Song B"}
          </p>
        </div>
        <div className="dock-safe" />
      </footer>
    </div>
  );
}

function SongSlot({ id, label }: { id: DeckId; label: string }) {
  const deck = useBooth((s) => (id === "a" ? s.deckA : s.deckB));
  const status = useBooth((s) => s.status);
  const loadFile = useBooth((s) => s.loadFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const reading = status === "loading";

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void loadFile(id, file);
  };

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-border transition-[box-shadow,background-color] duration-150 md:p-5",
        dragOver && "bg-surface-2 shadow-border-hover",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          {label}
        </p>
        {deck.hasTrack ? (
          <Badge>{Math.round(deck.bpm)} BPM</Badge>
        ) : (
          <Badge>Empty</Badge>
        )}
      </div>

      <h2 className="font-display truncate text-xl leading-tight text-fg sm:text-2xl">
        {deck.hasTrack ? deck.name : "Tap to load"}
      </h2>

      {/*
        Label + native file input is the most reliable iOS path.
        Programmatic .click() on a display:none input can fail on some Safari builds.
      */}
      <label
        htmlFor={inputId}
        className={cn(
          "group relative flex min-h-[7.5rem] cursor-pointer flex-col justify-end overflow-hidden rounded-lg bg-bg px-3 py-3 transition-colors duration-150",
          "active:bg-surface-2",
          "focus-within:ring-2 focus-within:ring-accent/40",
          reading && "pointer-events-none opacity-60",
        )}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={AUDIO_FILE_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {deck.hasTrack ? (
          <div
            className="flex h-14 w-full items-end gap-px px-0 py-0"
            aria-hidden
          >
            {deck.peaks.map((p, i) => (
              <span
                key={i}
                className="w-full rounded-sm bg-fg/70"
                style={{ height: `${Math.max(10, Math.round(p * 100))}%` }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-start justify-center gap-2 py-2">
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg shadow-border">
              <Upload className="size-4" />
            </span>
            <span className="text-sm text-muted">
              Files · Voice Memos · Downloads
            </span>
          </div>
        )}
        <span className="mt-2 text-xs text-subtle">
          {deck.hasTrack ? "Tap to replace" : "M4A, MP3, WAV"}
        </span>
      </label>

      <Button
        variant="secondary"
        className="h-12 w-full"
        disabled={reading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload />
        {deck.hasTrack ? `Replace ${label}` : `Choose ${label}`}
      </Button>
    </section>
  );
}
