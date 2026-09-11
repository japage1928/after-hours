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
 * - Remix — keep a song, swap in a new beat
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
    title: "Song → New beat",
    blurb:
      "Hand the decks to the AI DJ — it rides your song, teases the new beat, then drops a real remix move (bass swap, filter, power cut) onto the replacement groove.",
    slotA: "Song",
    slotB: "New beat",
    slotAHint: "The track you want remixed",
    slotBHint: "Replacement beat / instrumental",
    actionIdle: "Load song and new beat",
    actionBusy: "AI DJ building the remix…",
    actionReady: (a, b) => `AI DJ remix ${a} → ${b}`,
    briefLabel: "Tell the AI DJ",
    briefPlaceholder:
      "How should the remix feel? Peak-time bass swap, filter wash, power cut…",
    defaultPrompt:
      "AI DJ remix — ride the song, tease the new kick, then drop a clean bass-swap onto the new beat.",
    presets: [
      {
        id: "bass_swap",
        label: "Bass swap",
        prompt:
          "AI DJ: ride the song, tease the new kick, bass-swap the drop — new beat takes the floor.",
      },
      {
        id: "filter_blend",
        label: "Filter blend",
        prompt:
          "AI DJ: phrase-ride the original, filter-wash into the new beat bed.",
      },
      {
        id: "power_cut",
        label: "Power cut",
        prompt:
          "AI DJ: build the intro, then power-cut onto the new beat on the downbeat.",
      },
      {
        id: "echo_out",
        label: "Echo out",
        prompt:
          "AI DJ: echo the original out as the new beat lands on the one.",
      },
    ],
    landingTitle: "Remix",
    landingBlurb: "AI DJ changes the beat live.",
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
