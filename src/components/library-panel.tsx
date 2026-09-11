import { useState } from "react";
import { Download, Shuffle, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { songVoices, useStudio } from "@/lib/store";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LibraryPanel() {
  const open = useStudio((s) => s.libraryOpen);
  const library = useStudio((s) => s.library);
  const currentId = useStudio((s) => s.song?.id);
  const loadSong = useStudio((s) => s.loadSong);
  const mashSelected = useStudio((s) => s.mashSelected);
  const deleteSong = useStudio((s) => s.deleteSong);
  const exportSong = useStudio((s) => s.exportSong);
  const exportLibrary = useStudio((s) => s.exportLibrary);
  const [picked, setPicked] = useState<string[]>([]);

  if (!open) return null;

  const togglePick = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1] ?? id, id];
      return [...prev, id];
    });
  };

  const a = library.find((s) => s.id === picked[0]);
  const b = library.find((s) => s.id === picked[1]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-bg/70"
        aria-label="Close library"
        onClick={() => useStudio.getState().setLibraryOpen(false)}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-border md:max-w-sm">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-xs font-medium tracking-widest text-muted uppercase">
              Tape shelf
            </p>
            <h2 className="font-display text-2xl text-fg">Cuts</h2>
          </div>
          <div className="flex items-center gap-1">
            {library.length > 0 ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Export all cuts"
                onClick={() => exportLibrary()}
              >
                <Download />
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close"
              onClick={() => useStudio.getState().setLibraryOpen(false)}
            >
              <X />
            </Button>
          </div>
        </div>

        <p className="px-5 pb-3 text-xs text-subtle">
          Play a cut, export JSON, delete old ones, or pick two and mash their
          voices into a new original.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
          <ul className="flex flex-col gap-2">
            {library.length === 0 ? (
              <p className="px-1 py-6 text-sm text-muted">
                No cuts yet. Write one in the Write room.
              </p>
            ) : null}
            {library.map((song) => (
              <LibraryRow
                key={song.id}
                song={song}
                active={song.id === currentId}
                selected={picked.includes(song.id)}
                onPlay={() => {
                  loadSong(song, true);
                  void useStudio.getState().togglePlay();
                  useStudio.getState().setLibraryOpen(false);
                }}
                onPick={() => togglePick(song.id)}
                onExport={() => exportSong(song)}
                onDelete={() => {
                  if (
                    !window.confirm(
                      `Delete “${song.title}” from your shelf? This can’t be undone.`,
                    )
                  ) {
                    return;
                  }
                  deleteSong(song.id);
                  setPicked((prev) => prev.filter((id) => id !== song.id));
                }}
              />
            ))}
          </ul>
        </div>

        {a && b ? (
          <div className="absolute inset-x-0 bottom-0 border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button className="w-full" onClick={() => void mashSelected(a, b)}>
              <Shuffle />
              Mash {a.title} × {b.title}
            </Button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function LibraryRow({
  song,
  active,
  selected,
  onPlay,
  onPick,
  onExport,
  onDelete,
}: {
  song: Song;
  active: boolean;
  selected: boolean;
  onPlay: () => void;
  onPick: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-lg p-1",
        active ? "bg-bg" : "bg-surface-2",
      )}
    >
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={onPlay}
          className="min-w-0 flex-1 rounded-md px-3 py-2.5 text-left"
        >
          <p className="truncate font-medium text-fg">{song.title}</p>
          <p className="truncate text-xs text-muted">{songVoices(song)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {song.explicit ? <Badge tone="rec">E</Badge> : null}
            {song.mode === "mashup" ? <Badge>Mash</Badge> : null}
          </div>
        </button>
        <button
          type="button"
          onClick={onPick}
          aria-pressed={selected}
          className={cn(
            "m-1 w-16 shrink-0 rounded-md text-xs font-medium",
            selected ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
          )}
        >
          {selected ? "Picked" : "Pick"}
        </button>
      </div>
      <div className="flex gap-1 px-2 pb-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 flex-1 text-xs"
          onClick={onExport}
        >
          <Download className="size-3.5" />
          Export
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 flex-1 text-xs text-rec hover:text-rec"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>
    </li>
  );
}
