import { AudioLines, Mic2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GENRES, SPARKS } from "@/lib/genres";
import { useStudio } from "@/lib/store";
import { VOCALISTS } from "@/lib/vocalists";
import { cn } from "@/lib/utils";

function Seg({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex rounded-md bg-surface-2 p-1 shadow-border">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "h-9 flex-1 rounded-sm px-2 text-sm font-medium transition-colors duration-150",
            value === opt.id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function VoiceGrid({
  value,
  onChange,
  locked,
}: {
  value: string;
  onChange: (id: string) => void;
  locked?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {VOCALISTS.map((v) => {
        const on = v.id === value;
        const dim = locked === v.id;
        return (
          <button
            key={v.id}
            type="button"
            disabled={dim}
            onClick={() => onChange(v.id)}
            className={cn(
              "flex min-h-11 flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors duration-150",
              on
                ? "bg-accent text-accent-fg"
                : "bg-surface-2 text-fg shadow-border hover:shadow-border-hover",
              dim && "opacity-30",
            )}
          >
            <span className="font-display text-sm leading-tight">{v.monogram}</span>
            <span className={cn("truncate text-xs", on ? "text-accent-fg/80" : "text-muted")}>
              {v.name.split(" ")[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function WritePanel() {
  const prompt = useStudio((s) => s.prompt);
  const mode = useStudio((s) => s.mode);
  const explicit = useStudio((s) => s.explicit);
  const genre = useStudio((s) => s.genre);
  const vocalistA = useStudio((s) => s.vocalistA);
  const vocalistB = useStudio((s) => s.vocalistB);
  const length = useStudio((s) => s.length);
  const status = useStudio((s) => s.status);
  const error = useStudio((s) => s.error);
  const cutTrack = useStudio((s) => s.cutTrack);
  const busy = status === "writing" || status === "rendering";

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-2xl bg-surface p-4 shadow-border md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            Write a cut
          </p>
          <h2 className="font-display mt-1 text-2xl leading-tight text-fg">
            Spark, voices, press cut.
          </h2>
        </div>
        <Mic2 className="mt-1 size-4 text-subtle" />
      </div>

      <Textarea
        value={prompt}
        onChange={(e) => useStudio.getState().setPrompt(e.target.value)}
        placeholder="Two drunk lovers fighting in a parking lot. Trap x country. Filthy."
        maxLength={2000}
      />

      <div className="flex flex-wrap gap-1.5">
        {SPARKS.slice(0, 4).map((spark) => (
          <button
            key={spark}
            type="button"
            onClick={() => useStudio.getState().setPrompt(spark)}
            className="max-w-full rounded-full bg-surface-2 px-2.5 py-1 text-left text-xs text-muted transition-colors duration-150 hover:text-fg"
          >
            {spark}
          </button>
        ))}
      </div>

      <Seg
        options={[
          { id: "solo", label: "Solo" },
          { id: "mashup", label: "Mashup" },
        ]}
        value={mode}
        onChange={(id) => useStudio.getState().setMode(id as "solo" | "mashup")}
      />

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted">
          {mode === "mashup" ? "Voice A · verses" : "Vocalist"}
        </p>
        <VoiceGrid
          value={vocalistA}
          onChange={(id) => useStudio.getState().setVocalistA(id)}
          locked={mode === "mashup" ? vocalistB : undefined}
        />
      </div>

      {mode === "mashup" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-muted">Voice B · chorus</p>
          <VoiceGrid
            value={vocalistB}
            onChange={(id) => useStudio.getState().setVocalistB(id)}
            locked={vocalistA}
          />
        </div>
      ) : null}

      <p className="text-xs text-subtle">
        Original vocalists. Style mashups, never celebrity clones or stolen hooks.
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted">Lane</p>
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
          {GENRES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => useStudio.getState().setGenre(g.id)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3 text-sm transition-colors duration-150",
                genre === g.id
                  ? "bg-accent text-accent-fg"
                  : "bg-surface-2 text-muted hover:text-fg",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-fg">Explicit</p>
          <p className="text-xs text-muted">Leave it dirty. No clean edit.</p>
        </div>
        <Switch
          checked={explicit}
          onCheckedChange={(v) => useStudio.getState().setExplicit(v)}
          aria-label="Explicit lyrics"
        />
      </div>

      <Seg
        options={[
          { id: "hook", label: "Hook" },
          { id: "cut", label: "Cut" },
          { id: "full", label: "Full" },
        ]}
        value={length}
        onChange={(id) => useStudio.getState().setLength(id as "hook" | "cut" | "full")}
      />

      {error ? (
        <p className="text-sm text-rec" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => void cutTrack()}
      >
        <AudioLines />
        {status === "writing"
          ? "Writing…"
          : status === "rendering"
            ? "Pulling vocals…"
            : "Cut the track"}
      </Button>
      <div className="flex items-center gap-2">
        <Badge tone="rec">Live booth</Badge>
        <span className="text-xs text-subtle">Beat plays first. Vocals drop in as they land.</span>
      </div>
    </section>
  );
}
