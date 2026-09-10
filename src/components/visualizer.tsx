import { useEffect, useRef } from "react";
import { engine } from "@/lib/audio-engine";
import { cn } from "@/lib/utils";

const BAR_COUNT = 28;

export function Visualizer({
  className,
  getAnalyser,
  isActive,
}: {
  className?: string;
  getAnalyser?: () => AnalyserNode | null;
  isActive?: () => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const analyserFn = useRef(getAnalyser);
  const activeFn = useRef(isActive);
  analyserFn.current = getAnalyser;
  activeFn.current = isActive;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const bars = Array.from(root.children) as HTMLElement[];
    const bins = new Uint8Array(128);
    let raf = 0;
    const levels = new Array(BAR_COUNT).fill(0.18) as number[];

    const draw = (t: number) => {
      const analyser = (analyserFn.current ?? (() => engine.getAnalyser()))();
      if (analyser) analyser.getByteFrequencyData(bins);
      const playing = (activeFn.current ?? (() => engine.isPlaying()))();
      for (let i = 0; i < bars.length; i++) {
        const src = analyser ? (bins[Math.floor((i / bars.length) * 64) + 6] ?? 0) / 255 : 0;
        const pulse = 0.14 + 0.28 * Math.abs(Math.sin(t / 680 + i * 0.37));
        const target = playing && analyser ? Math.max(0.08, src) : pulse;
        levels[i] = (levels[i] ?? 0.18) * 0.72 + target * 0.28;
        const bar = bars[i];
        if (bar) bar.style.height = `${Math.round((levels[i] ?? 0.18) * 100)}%`;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "flex h-40 w-full items-center justify-between gap-1 md:h-52",
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          className="w-full rounded-full bg-fg/75"
          style={{ height: `${14 + ((i * 7) % 28)}%` }}
        />
      ))}
    </div>
  );
}
