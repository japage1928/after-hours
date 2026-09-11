export type BoothMode = "mashup" | "remix";

export type TechniquePreset = {
  id: string;
  label: string;
  prompt: string;
};

export const BOOTH_MODES: Record<
  BoothMode,
  {
    path: `/${BoothMode}`;
    label: string;
    eyebrow: string;
    title: string;
    blurb: string;
    actionIdle: string;
    actionBusy: string;
    actionReady: (a: string, b: string) => string;
    briefLabel: string;
    briefPlaceholder: string;
    defaultPrompt: string;
    presets: TechniquePreset[];
    landingTitle: string;
    landingBlurb: string;
  }
> = {
  mashup: {
    path: "/mashup",
    label: "Mashup",
    eyebrow: "Mashup booth",
    title: "Song A × Song B",
    blurb:
      "Fuse two tracks into one continuous mash — both grooves riding together with long blends and washes.",
    actionIdle: "Load both songs",
    actionBusy: "Building the mashup…",
    actionReady: (a, b) => `Mash ${a} × ${b}`,
    briefLabel: "Mash brief",
    briefPlaceholder:
      "How should the mash feel? Long blend, filter wash, both kicks in…",
    defaultPrompt:
      "Mash both songs into one fused cut — keep both grooves riding together with a long blend.",
    presets: [
      {
        id: "long_blend",
        label: "Long blend",
        prompt: "Long smooth mash — EQ bass handoff while both tracks ride.",
      },
      {
        id: "filter_blend",
        label: "Filter wash",
        prompt: "Filter sweep wash from A into B, keep the mash thick.",
      },
      {
        id: "echo_out",
        label: "Echo layer",
        prompt: "Echo A out as B lands, leave a ghost of A in the mash.",
      },
      {
        id: "bass_swap",
        label: "Bass trade",
        prompt: "Bass swap mid-mash — kill lows on A while B’s kick takes over.",
      },
    ],
    landingTitle: "Mashup",
    landingBlurb: "Layer two songs into one fused cut.",
  },
  remix: {
    path: "/remix",
    label: "Remix",
    eyebrow: "Remix DJ",
    title: "Song A → Song B",
    blurb:
      "Beat-match, phrase-align, and hand off with real DJ moves — bass swaps, filter blends, power cuts.",
    actionIdle: "Load both songs",
    actionBusy: "Building the remix…",
    actionReady: (a, b) => `Remix ${a} → ${b}`,
    briefLabel: "DJ brief",
    briefPlaceholder:
      "How should the handoff feel? Bass swap, filter wash, power cut…",
    defaultPrompt:
      "Club remix transition — phrase-match and hand off cleanly from A into B.",
    presets: [
      {
        id: "bass_swap",
        label: "Bass swap",
        prompt: "Bass swap — kill lows on A while B’s kick takes over.",
      },
      {
        id: "filter_blend",
        label: "Filter blend",
        prompt: "Filter sweep wash from A into B, phrase-aware.",
      },
      {
        id: "power_cut",
        label: "Power cut",
        prompt: "Power cut — hard drop to B on the downbeat.",
      },
      {
        id: "echo_out",
        label: "Echo out",
        prompt: "Echo A out as B lands on the one.",
      },
    ],
    landingTitle: "Remix",
    landingBlurb: "DJ the transition — cut, swap, hand off.",
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
    if (path === "/mashup" || path === "/remix") return path;
    if (path === "/settings") {
      const tab = url.searchParams.get("tab");
      if (
        tab === "settings" ||
        tab === "projects" ||
        tab === "profile" ||
        tab === "account" ||
        tab === "billing"
      ) {
        return `/settings?tab=${tab}`;
      }
      return "/settings";
    }
    if (path === "/pricing" || path === "/admin") return path;
  } catch {
    /* ignore */
  }
  return "/";
}
