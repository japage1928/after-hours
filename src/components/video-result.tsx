import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VideoResult } from "@/lib/video-store";
import { formatTime } from "@/lib/utils";

export function VideoResultPlayer({
  result,
  onDownload,
}: {
  result: VideoResult;
  onDownload: () => void;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-2xl bg-surface p-4 shadow-border md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            Ready to play
          </p>
          <h2 className="font-display mt-1 truncate text-2xl text-fg sm:text-3xl">
            {result.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{result.summary}</p>
        </div>
        <Badge tone="accent">
          Grok Imagine
          {` · ${result.aspectRatio}`}
          {` · ${formatTime(result.duration)}`}
        </Badge>
      </div>

      <video
        className="w-full overflow-hidden rounded-lg bg-bg"
        src={result.objectUrl}
        controls
        playsInline
        preload="metadata"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onDownload}>
          <Download className="size-4" />
          Download
        </Button>
      </div>
      <p className="text-xs text-subtle">
        Saved to Library on this device under Videos. Download a copy so you
        still have it if you switch browsers.
      </p>
    </section>
  );
}
