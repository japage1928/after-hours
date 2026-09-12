import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type ProductLane = "songs" | "video";

/** Songs vs Video — never mixed with Generate / Remix / Mashup tabs. */
export function ProductSwitcher({ lane }: { lane: ProductLane }) {
  return (
    <nav
      aria-label="Choose Songs or Video"
      className="flex items-center gap-1 rounded-md bg-surface-2 p-1"
    >
      <Link
        to="/generate"
        className={cn(
          "rounded px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:text-sm",
          lane === "songs"
            ? "bg-accent text-accent-fg"
            : "text-muted hover:text-fg",
        )}
      >
        Songs
      </Link>
      <Link
        to="/video"
        className={cn(
          "rounded px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:text-sm",
          lane === "video"
            ? "bg-accent text-accent-fg"
            : "text-muted hover:text-fg",
        )}
      >
        Video
      </Link>
    </nav>
  );
}
