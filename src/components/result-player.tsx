import { Download, Pause, Play, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Visualizer } from "@/components/visualizer";
import { studioPlayer } from "@/lib/studio-player";
import type { StudioResult } from "@/lib/studio-store";
import { formatTime } from "@/lib/utils";

export function ResultPlayer({
  result,
  playing,
  playhead,
  onPlay,
  onPause,
  onStop,
  onDownload,
}: {
  result: StudioResult;
  playing: boolean;
  playhead: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onDownload: () => void;
}) {
  const engine =
    result.engine === "ace-step"
      ? "ACE-Step"
      : result.mode === "mashup"
        ? "Bounced mashup"
        : "Local preview";

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-2xl bg-surface p-4 shadow-border md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            Ready to listen
          </p>
          <h2 className="font-display mt-1 truncate text-2xl text-fg sm:text-3xl">
            {result.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{result.summary}</p>
        </div>
        <Badge tone="accent">
          {engine}
          {result.bpm ? ` · ${Math.round(result.bpm)} BPM` : ""}
          {` · ${formatTime(result.duration)}`}
        </Badge>
      </div>

      <div className="overflow-hidden rounded-lg bg-bg px-3 py-3">
        <div className="mb-3 flex h-12 w-full items-end gap-px" aria-hidden>
          {result.peaks.map((p, i) => (
            <span
              key={i}
              className="w-full rounded-sm bg-fg/70"
              style={{ height: `${Math.max(10, Math.round(p * 100))}%` }}
            />
          ))}
        </div>
        <Visualizer
          className="h-20 sm:h-24"
          getAnalyser={() => studioPlayer.getAnalyser()}
          isActive={() => studioPlayer.isPlaying()}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="play"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (playing) onPause();
            else void onPlay();
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
          onClick={onStop}
        >
          <Square className="size-3.5 fill-current" />
        </Button>
        <p className="min-w-0 flex-1 text-sm tabular-nums text-muted">
          {formatTime(playhead)} / {formatTime(result.duration)}
        </p>
        <Button onClick={onDownload}>
          <Download className="size-4" />
          Download
        </Button>
      </div>
    </section>
  );
}
