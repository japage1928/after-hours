export type BoothMode = "generate" | "remix" | "mashup";

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
  actionIdle: string;
  actionBusy: string;
  briefLabel: string;
  briefPlaceholder: string;
  defaultPrompt: string;
  presets: TechniquePreset[];
  landingTitle: string;
  landingBlurb: string;
};

/**
 * Product pillars:
 * - Generate — describe a song, AI writes a full listen (ACE-Step)
 * - Remix — one owned song rebuilt onto a new beat/style
 * - Mashup — beats of one owned track × lyrics/vocals of another
 */
export const BOOTH_MODES: Record<BoothMode, BoothModeMeta> = {
  generate: {
    path: "/generate",
    label: "Generate",
    eyebrow: "AI generate",
    title: "Describe a song. Get a song.",
    blurb:
      "Prompt, pick a style, optionally paste lyrics. After Hours generates a full track you can play and download — ACE-Step via Replicate, labeled honestly. Not Suno.",
    actionIdle: "Write a prompt first",
    actionBusy: "Generating your song…",
    briefLabel: "Song prompt",
    briefPlaceholder:
      "Late-night synth-pop about a last train home, big chorus, female vocal…",
    defaultPrompt: "",
    presets: [
      {
        id: "night_drive",
        label: "Night drive",
        prompt:
          "Night-drive synth-pop, warm bass, bright chorus, original vocal, city lights.",
      },
      {
        id: "club",
        label: "Club hook",
        prompt:
          "Club-ready hook, punchy drums, catchy topline, late-night energy.",
      },
      {
        id: "story",
        label: "Story song",
        prompt:
          "Story-first song, clear verses and a singable chorus, intimate production.",
      },
      {
        id: "instrumental",
        label: "Instrumental",
        prompt:
          "Cinematic instrumental, no vocals, evolving drums and melody, radio-length.",
      },
    ],
    landingTitle: "Generate",
    landingBlurb: "Describe it. AI writes a full song.",
  },
  remix: {
    path: "/remix",
    label: "Remix",
    eyebrow: "AI remix",
    title: "Your song. New beat.",
    blurb:
      "Upload a track you own. Pick a lane — EDM, dubstep, rock, country, and more. AI builds a new production and lays your song on it for a full listen, not a DJ crossfade demo.",
    actionIdle: "Load a song you own",
    actionBusy: "Rebuilding the mix…",
    briefLabel: "Remix brief (optional)",
    briefPlaceholder:
      "e.g. late-night dubstep drop, keep my vocal, huge bass — or dusty country train-beat…",
    defaultPrompt:
      "Rebuild this song in the selected style — keep the vocal character, new drums and bass.",
    presets: [
      {
        id: "edm",
        label: "EDM drop",
        prompt:
          "EDM remix — ride the vocal, festival clap, big 4/4, keep the hook.",
      },
      {
        id: "dubstep",
        label: "Dubstep",
        prompt:
          "Dubstep remix — half-time pocket, heavy bass, vocal stays up front.",
      },
      {
        id: "rock",
        label: "Rock",
        prompt:
          "Rock remix — live backbeat, guitar energy, vocal up for the chorus.",
      },
      {
        id: "country",
        label: "Country",
        prompt:
          "Country remix — train-beat groove, two-step pocket, story vocal clear.",
      },
    ],
    landingTitle: "Remix",
    landingBlurb: "One song you own, rebuilt onto a new beat.",
  },
  mashup: {
    path: "/mashup",
    label: "Mashup",
    eyebrow: "Mashup booth",
    title: "Beats × Lyrics",
    blurb:
      "Beats from one track you own, lyrics/vocals from another. After Hours beat-matches them into one mashup you can play and download.",
    actionIdle: "Load beats and lyrics",
    actionBusy: "Building the mashup…",
    briefLabel: "Mash note (optional)",
    briefPlaceholder: "Keep vocals clear, kick driving…",
    defaultPrompt:
      "Lock the beat under the lyrics — clear vocals, solid kick, full ride.",
    presets: [
      {
        id: "lock",
        label: "Lock & ride",
        prompt: "Lock the beat under the lyrics and ride both — vocal clear, kick solid.",
      },
      {
        id: "vocal_up",
        label: "Vocal up",
        prompt: "Push lyrics forward, keep the beat underneath, no muddy mids.",
      },
      {
        id: "bass_first",
        label: "Bass first",
        prompt: "Let the beat bed lead; lyrics sit in the pocket.",
      },
    ],
    landingTitle: "Mashup",
    landingBlurb: "Beats from one song. Lyrics from another.",
  },
};

export const BOOTH_MODE_ORDER: BoothMode[] = ["generate", "remix", "mashup"];

export function isBoothMode(value: string): value is BoothMode {
  return value === "generate" || value === "remix" || value === "mashup";
}

/** Safe post-login redirect targets. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/generate";
  try {
    const url = raw.startsWith("/")
      ? new URL(raw, "http://local")
      : new URL(raw, "http://local");
    const path = url.pathname;
    if (
      path === "/generate" ||
      path === "/mashup" ||
      path === "/remix" ||
      path === "/help" ||
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
  return "/generate";
}
