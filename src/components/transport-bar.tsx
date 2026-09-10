import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { engine } from "@/lib/audio-engine";
import { useStudio } from "@/lib/store";
import { formatTime } from "@/lib/utils";

export function TransportBar() {
  const playing = useStudio((s) => s.playing);
  const beats = useStudio((s) => s.beats);
  const durationBeats = useStudio((s) => s.durationBeats);
  const mix = useStudio((s) => s.mix);
  const togglePlay = useStudio((s) => s.togglePlay);
  const stop = useStudio((s) => s.stop);
  const seek = useStudio((s) => s.seek);
  const setMix = useStudio((s) => s.setMix);

  const elapsed = engine.beatsToSeconds(beats);
  const total = engine.beatsToSeconds(durationBeats || 1);

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg">
      <div className="mx-auto flex max-w-7xl min-w-0 flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-6 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            size="play"
            variant="default"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => void togglePlay()}
            className="shrink-0"
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
            onClick={stop}
            className="size-11"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
          <p className="w-24 shrink-0 text-xs tabular-nums text-muted">
            {formatTime(elapsed)}
            <span className="text-subtle"> / {formatTime(total)}</span>
          </p>
        </div>

        <Slider
          className="min-w-0 flex-1"
          min={0}
          max={Math.max(1, durationBeats)}
          step={0.25}
          value={[Math.min(beats, durationBeats)]}
          onValueChange={(v) => seek(v[0] ?? 0)}
          aria-label="Seek"
        />

        <div className="grid w-full min-w-0 grid-cols-3 gap-3 md:flex md:w-80 md:shrink-0">
          <label className="flex min-w-0 flex-1 flex-col gap-0">
            <span className="text-xs tracking-wide text-subtle uppercase">Beat</span>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[mix.beat]}
              onValueChange={(v) => setMix({ beat: v[0] ?? 0 })}
              aria-label="Beat level"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-0">
            <span className="text-xs tracking-wide text-subtle uppercase">Bass</span>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[mix.bass]}
              onValueChange={(v) => setMix({ bass: v[0] ?? 0 })}
              aria-label="Bass level"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-0">
            <span className="text-xs tracking-wide text-subtle uppercase">Vox</span>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[mix.vocals]}
              onValueChange={(v) => setMix({ vocals: v[0] ?? 0 })}
              aria-label="Vocal level"
            />
          </label>
        </div>
      </div>
      <div className="dock-safe" />
    </footer>
  );
}
