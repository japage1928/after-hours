import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PlansGrid } from "@/components/plans-grid";
import { ResultPlayer } from "@/components/result-player";
import { AUDIO_FILE_ACCEPT } from "@/lib/audio-file";
import { GROOVE_STYLES } from "@/lib/ai-beat";
import { BOOTH_MODES, type BoothMode } from "@/lib/booth-mode";
import { nextGrooveStyle, writeLibraryHandoff } from "@/lib/track-library";
import { useStudioBooth, type LoadedTrack } from "@/lib/studio-store";
import { cn } from "@/lib/utils";

const DURATIONS = [
  { id: 30, label: "~30s" },
  { id: 60, label: "~60s" },
  { id: 90, label: "~90s" },
] as const;

export function StudioPanel({ mode }: { mode: BoothMode }) {
  const meta = BOOTH_MODES[mode];
  const hydrate = useStudioBooth((s) => s.hydrate);
  const status = useStudioBooth((s) => s.status);
  const statusText = useStudioBooth((s) => s.statusText);
  const error = useStudioBooth((s) => s.error);
  const needsUpgrade = useStudioBooth((s) => s.needsUpgrade);
  const capabilities = useStudioBooth((s) => s.capabilities);
  const prompt = useStudioBooth((s) => s.prompt);
  const setPrompt = useStudioBooth((s) => s.setPrompt);
  const lyrics = useStudioBooth((s) => s.lyrics);
  const setLyrics = useStudioBooth((s) => s.setLyrics);
  const instrumental = useStudioBooth((s) => s.instrumental);
  const setInstrumental = useStudioBooth((s) => s.setInstrumental);
  const durationSec = useStudioBooth((s) => s.durationSec);
  const setDurationSec = useStudioBooth((s) => s.setDurationSec);
  const grooveStyle = useStudioBooth((s) => s.grooveStyle);
  const setGrooveStyle = useStudioBooth((s) => s.setGrooveStyle);
  const sourceA = useStudioBooth((s) => s.sourceA);
  const sourceB = useStudioBooth((s) => s.sourceB);
  const result = useStudioBooth((s) => s.result);
  const playing = useStudioBooth((s) => s.playing);
  const playhead = useStudioBooth((s) => s.playhead);
  const generate = useStudioBooth((s) => s.generate);
  const remix = useStudioBooth((s) => s.remix);
  const mashup = useStudioBooth((s) => s.mashup);
  const lastLibrarySave = useStudioBooth((s) => s.lastLibrarySave);
  const loadSourceFromBuffer = useStudioBooth((s) => s.loadSourceFromBuffer);
  const playResult = useStudioBooth((s) => s.playResult);
  const pauseResult = useStudioBooth((s) => s.pauseResult);
  const stopResult = useStudioBooth((s) => s.stopResult);
  const downloadResult = useStudioBooth((s) => s.downloadResult);
  const navigate = useNavigate();

  const busy = status === "loading" || status === "generating";

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

  useEffect(() => {
    if (mode !== "generate") {
      setPrompt(meta.defaultPrompt);
    }
  }, [mode, meta.defaultPrompt, setPrompt]);

  const ready =
    mode === "generate"
      ? prompt.trim().length >= 2
      : mode === "remix"
        ? Boolean(sourceA)
        : Boolean(sourceA && sourceB) || Boolean(sourceB);

  const cta =
    status === "generating"
      ? meta.actionBusy
      : ready
        ? mode === "generate"
          ? "Generate song"
          : mode === "remix"
            ? `Remix as ${GROOVE_STYLES.find((g) => g.id === grooveStyle)?.label ?? grooveStyle}`
            : sourceA && sourceB
              ? `Mash ${sourceA.name} × ${sourceB.name}`
              : "Mash lyrics with a local preview beat"
        : meta.actionIdle;

  function runPrimary() {
    if (mode === "generate") void generate();
    else if (mode === "remix") void remix();
    else if (sourceA && sourceB) void mashup();
    else void mashup({ localBeat: true });
  }

  async function remixThisResult() {
    if (!result) return;
    await loadSourceFromBuffer("a", result.buffer, result.title);
    void navigate({ to: "/remix" });
  }

  function tryAnotherStyle() {
    const next = nextGrooveStyle(result?.style ?? grooveStyle);
    setGrooveStyle(next);
    if (mode === "generate") {
      toast.message(`Style set to ${GROOVE_STYLES.find((g) => g.id === next)?.label ?? next}. Hit Generate song.`);
      return;
    }
    if (result?.mode === "generate") {
      writeLibraryHandoff({
        kind: "generate-again",
        prompt: result.prompt || prompt,
        style: next,
        lyrics,
      });
      void navigate({ to: "/generate" });
      return;
    }
    if (result) {
      void loadSourceFromBuffer("a", result.buffer, result.title).then(() => {
        void navigate({ to: "/remix" });
      });
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl min-w-0 flex-col gap-4 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:gap-5 md:px-8">
      <section className="flex min-w-0 flex-col gap-2 rounded-2xl bg-surface p-4 shadow-border sm:gap-2 md:p-5">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">
          {meta.eyebrow}
        </p>
        <h1 className="font-display text-[2rem] leading-none tracking-tight text-fg sm:text-4xl">
          {meta.title}
        </h1>
        <p className="text-sm text-muted">{meta.blurb}</p>
        {capabilities ? (
          <p className="text-xs text-subtle">{capabilities.engineLabel}</p>
        ) : null}
      </section>

      {mode === "generate" ? (
        <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-border md:p-5">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-widest text-muted uppercase">
              {meta.briefLabel}
            </span>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={meta.briefPlaceholder}
              maxLength={2000}
              className="min-h-28"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {meta.presets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setPrompt(t.prompt);
                  if (t.id === "instrumental") setInstrumental(true);
                }}
                className={cn(
                  "rounded-md bg-surface-2 px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg",
                  prompt === t.prompt && "bg-accent text-accent-fg",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <StylePicker value={grooveStyle} onChange={setGrooveStyle} />
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-medium tracking-widest text-muted uppercase">
              Length
            </p>
            {DURATIONS.map((d) => (
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
            <label className="ml-auto flex items-center gap-2 text-sm text-muted">
              <Switch
                checked={instrumental}
                onCheckedChange={setInstrumental}
              />
              Instrumental
            </label>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-widest text-muted uppercase">
              Lyrics (optional)
            </span>
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Paste your own lyrics, or leave blank and AI will write them."
              maxLength={4000}
              className="min-h-20"
              disabled={instrumental}
            />
          </label>
        </section>
      ) : null}

      {mode === "remix" ? (
        <>
          <TrackSlot
            slot="a"
            label="Your song"
            hint="A track you own — AI rebuilds it onto a new beat"
            track={sourceA}
          />
          <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-border md:p-5">
            <StylePicker value={grooveStyle} onChange={setGrooveStyle} />
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-widest text-muted uppercase">
                {meta.briefLabel}
              </span>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={meta.briefPlaceholder}
                maxLength={400}
                className="min-h-20"
              />
            </label>
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
          </section>
        </>
      ) : null}

      {mode === "mashup" ? (
        <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4">
            <TrackSlot
              slot="a"
              label="Beats"
              hint="Instrumental / beat bed you own"
              track={sourceA}
            />
            <TrackSlot
              slot="b"
              label="Lyrics"
              hint="Vocal / lyrics track you own"
              track={sourceB}
            />
          </div>
          <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-border md:p-5">
            <p className="text-xs font-medium tracking-widest text-muted uppercase">
              Local preview beat (optional)
            </p>
            <p className="text-sm text-muted">
              Only have vocals? Pick a style and mash over a labeled drum-bed.
              That’s not your file and not ACE-Step.
            </p>
            <StylePicker value={grooveStyle} onChange={setGrooveStyle} />
          </section>
        </>
      ) : null}

      <p className="px-1 text-xs leading-relaxed text-subtle sm:text-sm">
        {mode === "generate"
          ? "Full-song AI generation. Quality is ACE-Step, not Suno — we label the engine honestly. Your first two AI songs this month are included."
          : mode === "remix"
            ? "Upload stays on your device. ACE-Step writes a new production when it’s configured; otherwise we bounce a labeled local drum-bed so you still leave with a listen."
            : "Beats on the left, lyrics/vocals on the right — both tracks you own. Mashup never spends AI quota. On iPhone: pick M4A or MP3 from Files."}
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
        {mode === "remix" && sourceA && !busy ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void remix({ localPreview: true })}
          >
            Remix with local drums (no AI quota)
          </Button>
        ) : null}
        {mode === "mashup" && sourceB && !sourceA && !busy ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void mashup({ localBeat: true })}
          >
            Mash lyrics with a local preview beat
          </Button>
        ) : null}
      </section>

      {result && result.mode === mode ? (
        <ResultPlayer
          result={result}
          playing={playing}
          playhead={playhead}
          onPlay={() => void playResult()}
          onPause={pauseResult}
          onStop={stopResult}
          onDownload={downloadResult}
        >
          <Button
            variant="secondary"
            className="h-11"
            onClick={() => void remixThisResult()}
          >
            Remix this
          </Button>
          <Button
            variant="secondary"
            className="h-11"
            onClick={tryAnotherStyle}
          >
            Try another style
          </Button>
          <Button asChild variant="secondary" className="h-11">
            <Link to="/projects">Library</Link>
          </Button>
        </ResultPlayer>
      ) : null}

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-8">
          <Button
            size="lg"
            className="h-12 min-w-0 flex-1"
            onClick={runPrimary}
            disabled={busy || !ready}
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

function StylePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: (typeof GROOVE_STYLES)[number]["id"]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">
        Style
      </p>
      <div className="flex flex-wrap gap-1.5">
        {GROOVE_STYLES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.id)}
            className={cn(
              "rounded-md bg-surface-2 px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:text-fg",
              value === g.id && "bg-accent text-accent-fg",
            )}
          >
            <span className="font-medium">{g.label}</span>
            <span className="mt-0.5 block text-[10px] opacity-80">{g.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TrackSlot({
  slot,
  label,
  hint,
  track,
}: {
  slot: "a" | "b";
  label: string;
  hint: string;
  track: LoadedTrack | null;
}) {
  const loadSource = useStudioBooth((s) => s.loadSource);
  const status = useStudioBooth((s) => s.status);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const reading = status === "loading";

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void loadSource(slot, file);
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
        {track ? (
          <Badge>{Math.round(track.bpm)} BPM</Badge>
        ) : (
          <Badge>Empty</Badge>
        )}
      </div>
      <h2 className="font-display truncate text-xl leading-tight text-fg sm:text-2xl">
        {track ? track.name : "Tap to load"}
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
        {track ? (
          <div className="flex h-14 w-full items-end gap-px" aria-hidden>
            {track.peaks.map((p, i) => (
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
          {track ? "Tap to replace" : "M4A, MP3, WAV · under 40 MB"}
        </span>
      </label>
      <Button
        variant="secondary"
        className="h-12 w-full"
        disabled={reading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload />
        {track ? `Replace ${label}` : `Choose ${label}`}
      </Button>
    </section>
  );
}
