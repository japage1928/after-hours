export type BoothMode = "mashup" | "remix";

export type TechniquePreset = {
  id: string;
  label: string;
  prompt: string;
};

export type BoothModeMeta = {
  path: `/${BoothMode}`;
  label: string;
  eyebrow: string;
  title: string;
  blurb: string;
  /** Deck A role label in the booth. */
  slotA: string;
  /** Deck B role label in the booth. */
  slotB: string;
  slotAHint: string;
  slotBHint: string;
  actionIdle: string;
  actionBusy: string;
  actionReady: (a: string, b: string) => string;
  briefLabel: string;
  briefPlaceholder: string;
  defaultPrompt: string;
  presets: TechniquePreset[];
  landingTitle: string;
  landingBlurb: string;
  footerJoin: (a: string, b: string) => string;
};

/**
 * Product definitions:
 * - Mashup — beats of one song + lyrics/vocals of another
 * - Remix — one song remixed into a genre lane (EDM, dubstep, rock, country, …)
 */
export const BOOTH_MODES: Record<BoothMode, BoothModeMeta> = {
  mashup: {
    path: "/mashup",
    label: "Mashup",
    eyebrow: "Mashup booth",
    title: "Beats × Lyrics",
    blurb:
      "Drop the groove from one track under the vocals of another — beat bed on A, lyrics on B, riding together.",
    slotA: "Beats",
    slotB: "Lyrics",
    slotAHint: "Instrumental / beat bed you own",
    slotBHint: "Vocal / lyrics track you own",
    actionIdle: "Load beats and lyrics",
    actionBusy: "Building the mashup…",
    actionReady: (a, b) => `Mash ${a} × ${b}`,
    briefLabel: "Mash brief",
    briefPlaceholder:
      "How should beats and lyrics lock? Long blend, filter wash, bass trade…",
    defaultPrompt:
      "Mash the beat bed under the lyrics — phrase-lock both, keep vocals clear and the kick driving.",
    presets: [
      {
        id: "long_blend",
        label: "Lock & ride",
        prompt:
          "Lock the beat under the lyrics and ride both — clear vocals, solid kick, long blend.",
      },
      {
        id: "filter_blend",
        label: "Filter wash",
        prompt:
          "Wash the beat in under the lyrics with a filter sweep — keep the vocal pocket open.",
      },
      {
        id: "bass_swap",
        label: "Bass trade",
        prompt:
          "Bass trade into the mash — lyrics stay up while the new kick takes the floor.",
      },
      {
        id: "echo_out",
        label: "Ghost intro",
        prompt:
          "Ghost the beat in with a short echo, then lock lyrics over the groove.",
      },
    ],
    landingTitle: "Mashup",
    landingBlurb: "Beats from one song. Lyrics from another.",
    footerJoin: (a, b) => `${a} × ${b}`,
  },
  remix: {
    path: "/remix",
    label: "Remix",
    eyebrow: "AI DJ remix",
    title: "You bring the song. AI DJ brings the beat.",
    blurb:
      "Load one song. Pick a remix lane — EDM, dubstep, rock, country, and more — and the AI DJ builds that groove, then drops a live remix onto it.",
    slotA: "Song",
    slotB: "AI beat",
    slotAHint: "The track you want remixed",
    slotBHint: "Genre beat from the AI DJ (or upload your own)",
    actionIdle: "Load a song",
    actionBusy: "AI DJ remixing…",
    actionReady: (a, b) => `AI DJ remix ${a} → ${b}`,
    briefLabel: "Remix brief (plain English)",
    briefPlaceholder:
      "e.g. late-night dubstep drop, keep my vocal vibes, huge bass — or dusty country train-beat under the chorus…",
    defaultPrompt:
      "Remix this song in the selected genre — keep the vibe, rebuild the drums and bass for that lane.",
    presets: [
      {
        id: "edm",
        label: "EDM drop",
        prompt:
          "EDM remix — ride the vocal, build tension, festival clap drop onto a big 4/4.",
      },
      {
        id: "dubstep",
        label: "Dubstep",
        prompt:
          "Dubstep remix — half-time pocket, tease the snare, heavy drop onto the new beat.",
      },
      {
        id: "rock",
        label: "Rock",
        prompt:
          "Rock remix — keep the vocal up, drive a live backbeat, power into the chorus feel.",
      },
      {
        id: "country",
        label: "Country",
        prompt:
          "Country remix — train-beat groove under the vocal, two-step pocket, clear story.",
      },
    ],
    landingTitle: "Remix",
    landingBlurb: "EDM, dubstep, rock, country — AI DJ remixes your song.",
    footerJoin: (a, b) => `${a} → ${b}`,
  },
};

export function isBoothMode(value: string): value is BoothMode {
  return value === "mashup" || value === "remix";
}

/** Safe post-login redirect targets. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  try {
    const url = raw.startsWith("/")
      ? new URL(raw, "http://local")
      : new URL(raw, "http://local");
    const path = url.pathname;
    if (
      path === "/mashup" ||
      path === "/remix" ||
      path === "/settings" ||
      path === "/projects" ||
      path === "/profile" ||
      path === "/account" ||
      path === "/billing" ||
      path === "/pricing" ||
      path === "/admin"
    ) {
      return path;
    }
    // Legacy settings?tab=…
    if (path === "/settings") {
      const tab = url.searchParams.get("tab");
      if (
        tab === "projects" ||
        tab === "profile" ||
        tab === "account" ||
        tab === "billing"
      ) {
        return `/${tab}`;
      }
      return "/settings";
    }
  } catch {
    /* ignore */
  }
  return "/";
}
