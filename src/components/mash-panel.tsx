import { useEffect, useId, useRef, useState } from "react";
import {
  AudioLines,
  Pause,
  Play,
  Shuffle,
  Square,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Visualizer } from "@/components/visualizer";
import { PlansGrid } from "@/components/plans-grid";
import { AUDIO_FILE_ACCEPT } from "@/lib/audio-file";
import { BOOTH_MODES, type BoothMode } from "@/lib/booth-mode";
import { djEngine, type DeckId } from "@/lib/dj-engine";
import { useBooth } from "@/lib/dj-store";
import { cn, formatTime } from "@/lib/utils";

const TECHNIQUE_LABEL: Record<string, string> = {
  bass_swap: "Bass swap",
  filter_blend: "Filter blend",
  power_cut: "Power cut",
  long_blend: "Long blend",
  echo_out: "Echo out",
};

export function MashPanel({ mode }: { mode: BoothMode }) {
  const meta = BOOTH_MODES[mode];
  const hydrate = useBooth((s) => s.hydrate);
  const status = useBooth((s) => s.status);
  const statusText = useBooth((s) => s.statusText);
  const error = useBooth((s) => s.error);
  const cue = useBooth((s) => s.cue);
  const plan = useBooth((s) => s.plan);
  const prompt = useBooth((s) => s.prompt);
  const setPrompt = useBooth((s) => s.setPrompt);
  const playing = useBooth((s) => s.playing);
  const dropMix = useBooth((s) => s.dropMix);
  const runLocalMix = useBooth((s) => s.runLocalMix);
  const playMash = useBooth((s) => s.playMash);
  const pauseMix = useBooth((s) => s.pauseMix);
  const stopMix = useBooth((s) => s.stopMix);
  const setMode = useBooth((s) => s.setMode);
  const syncB = useBooth((s) => s.syncB);
  const xfader = useBooth((s) => s.xfader);
  const setXfader = useBooth((s) => s.setXfader);
  const deckA = useBooth((s) => s.deckA);
  const deckB = useBooth((s) => s.deckB);
  const timeA = useBooth((s) => s.timeA);
  const timeB = useBooth((s) => s.timeB);
  const needsUpgrade = useBooth((s) => s.needsUpgrade);
  const usedAi = useBooth((s) => s.usedAi);
  const busy = status === "loading" || status === "planning";
  const ready = deckA.hasTrack && deckB.hasTrack;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);

  useEffect(() => {
    setPrompt(meta.defaultPrompt);
  }, [mode, meta.defaultPrompt, setPrompt]);

  return (
    <div className="mx-auto flex max-w-3xl min-w-0 flex-col gap-4 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:gap-5 md:px-8">
      <section className="flex min-w-0 flex-col gap-2 rounded-2xl bg-surface p-4 shadow-border sm:gap-3 md:p-6">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          {meta.eyebrow}
        </p>
        <h1 className="font-display text-[2rem] leading-none tracking-tight text-fg sm:text-4xl md:text-5xl">
          {meta.title}
        </h1>
        <p className="text-sm text-muted">{meta.blurb}</p>
      </section>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4">
        <SongSlot id="a" label={meta.slotA} hint={meta.slotAHint} />
        <SongSlot id="b" label={meta.slotB} hint={meta.slotBHint} />
      </div>

      <p className="px-1 text-xs leading-relaxed text-subtle sm:text-sm">
        {mode === "mashup"
          ? "Beats on the left, lyrics/vocals on the right — both tracks you own. "
          : "Original song on the left, replacement beat on the right — both files you own. "}
        On iPhone: pick an M4A or MP3 from Files, Downloads, or Voice Memos. Apple
        Music catalog tracks can’t be uploaded.
      </p>

      <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-border md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            {meta.briefLabel}
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={!deckA.hasTrack || !deckB.hasTrack}
            onClick={syncB}
          >
            <AudioLines className="size-3.5" />
            {mode === "mashup" ? "Sync lyrics to beats" : "Sync beat to song"}
          </Button>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={meta.briefPlaceholder}
          maxLength={400}
          className="min-h-20"
        />
        <div className="flex flex-wrap gap-1.5">
          {meta.presets.map((t) => (
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

        <label className="flex flex-col gap-2 pt-1">
          <span className="flex justify-between text-xs text-muted">
            <span>Crossfader</span>
            <span className="tabular-nums">
              {xfader < -0.33
                ? meta.slotA
                : xfader > 0.33
                  ? meta.slotB
                  : "Blend"}
            </span>
          </span>
          <Slider
            min={-1}
            max={1}
            step={0.01}
            value={[xfader]}
            onValueChange={([v]) => setXfader(v ?? 0)}
          />
        </label>
      </section>

      <section className="flex min-w-0 flex-col gap-4 rounded-2xl bg-surface p-4 shadow-border md:p-5">
        <Button
          size="lg"
          className="h-12 w-full"
          onClick={() => void dropMix()}
          disabled={busy || !ready}
        >
          <Shuffle />
          {status === "planning"
            ? meta.actionBusy
            : ready
              ? meta.actionReady(deckA.name, deckB.name)
              : meta.actionIdle}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {plan ? (
            <Badge tone="accent">
              {TECHNIQUE_LABEL[plan.technique] ?? plan.technique}
              {plan.bassSwap ? " · bass swap" : ""}
              {` · ${Math.round(plan.targetBpm)} BPM`}
              {usedAi === true
                ? mode === "remix"
                  ? " · AI DJ"
                  : " · AI"
                : usedAi === false
                  ? " · local"
                  : ""}
            </Badge>
          ) : null}
          <p className="text-sm text-muted">{statusText}</p>
        </div>
        {error ? <p className="text-sm text-rec">{error}</p> : null}
        {needsUpgrade ? (
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-bg/60 p-4">
            <PlansGrid compact paywall />
            <Button
              variant="secondary"
              className="w-full"
              disabled={!ready || busy}
              onClick={() => void runLocalMix()}
            >
              Continue with free local mix
            </Button>
          </div>
        ) : null}
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
          A {formatTime(timeA)}
          {deckA.hasTrack ? ` · ${Math.round(deckA.bpm)} BPM` : ""}
          {"  ·  "}
          B {formatTime(timeB)}
          {deckB.hasTrack ? ` · ${Math.round(deckB.bpm)} BPM` : ""}
          {playing ? (mode === "mashup" ? " · in the mash" : " · in the remix") : ""}
        </p>
      </section>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-8">
          <Button
            size="play"
            aria-label={playing ? `Pause ${meta.label}` : `Play ${meta.label}`}
            disabled={!ready}
            onClick={() => {
              if (playing) pauseMix();
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
            {ready
              ? meta.footerJoin(deckA.name, deckB.name)
              : meta.title}
          </p>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </footer>
    </div>
  );
}

function SongSlot({
  id,
  label,
  hint,
}: {
  id: DeckId;
  label: string;
  hint: string;
}) {
  const deck = useBooth((s) => (id === "a" ? s.deckA : s.deckB));
  const status = useBooth((s) => s.status);
  const loadFile = useBooth((s) => s.loadFile);
  const eq = useBooth((s) => (id === "a" ? s.eqA : s.eqB));
  const setEq = useBooth((s) => s.setEq);
  const playDeck = useBooth((s) => s.playDeck);
  const pauseDeck = useBooth((s) => s.pauseDeck);
  const playing = useBooth((s) => (id === "a" ? s.playingA : s.playingB));
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
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            {label}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-subtle">{hint}</p>
        </div>
        {deck.hasTrack ? (
          <Badge>{Math.round(deck.bpm)} BPM</Badge>
        ) : (
          <Badge>Empty</Badge>
        )}
      </div>

      <h2 className="font-display truncate text-xl leading-tight text-fg sm:text-2xl">
        {deck.hasTrack ? deck.name : "Tap to load"}
      </h2>

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
          <div className="flex h-14 w-full items-end gap-px" aria-hidden>
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

      {deck.hasTrack ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                if (playing) pauseDeck(id);
                else void playDeck(id);
              }}
            >
              {playing ? (
                <Pause className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
              {playing ? "Pause" : "Cue"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              disabled={reading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Replace
            </Button>
          </div>
          {(["low", "mid", "high"] as const).map((band) => (
            <label
              key={band}
              className="flex items-center gap-2 text-xs text-muted"
            >
              <span className="w-8 uppercase">{band}</span>
              <Slider
                className="flex-1"
                min={-1}
                max={1}
                step={0.05}
                value={[eq[band]]}
                onValueChange={([v]) => setEq(id, band, v ?? 0)}
              />
            </label>
          ))}
        </div>
      ) : (
        <Button
          variant="secondary"
          className="h-12 w-full"
          disabled={reading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload />
          Choose {label}
        </Button>
      )}
    </section>
  );
}
