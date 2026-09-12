export type VideoPreset = {
  id: string;
  label: string;
  prompt: string;
};

/**
 * Video is its own studio at `/video` — not a fourth music-booth tab.
 * Prompt + QA by Grok / xAI; pixels by Grok Imagine.
 */
export const VIDEO_STUDIO = {
  path: "/video" as const,
  label: "Video",
  eyebrow: "AI video",
  title: "Describe a clip. Get a clip.",
  blurb:
    "Prompt + QA by Grok / xAI; video by Grok Imagine. Short clips only — not a timeline editor, not ACE-Step.",
  actionIdle: "Write a prompt first",
  actionBusy: "Generating your clip…",
  briefLabel: "Video prompt",
  briefPlaceholder: "Neon rain on a midnight taxi, wet asphalt, slow push-in…",
  defaultPrompt:
    "Neon rain on a midnight taxi, wet asphalt reflections, slow cinematic push-in.",
  presets: [
    {
      id: "taxi",
      label: "Night taxi",
      prompt:
        "Neon rain on a midnight taxi, wet asphalt reflections, slow cinematic push-in.",
    },
    {
      id: "booth",
      label: "Booth glow",
      prompt:
        "Late-night studio booth, analog meters glowing, dust in a red backlight, camera drifts past a microphone.",
    },
    {
      id: "city",
      label: "City after",
      prompt:
        "Empty downtown after last call, steam from a grate, one streetlight flicker, handheld walk-by.",
    },
    {
      id: "vertical",
      label: "Vertical hook",
      prompt:
        "Close-up vinyl spinning under club lights, bass-driven cuts, vertical frame, no text.",
    },
  ] satisfies VideoPreset[],
  landingTitle: "Video",
  landingBlurb: "Describe a clip. Grok Imagine renders it.",
  engineLine:
    "Prompt + QA by Grok / xAI; video by Grok Imagine (grok-imagine-video-1.5).",
};

export const VIDEO_DURATIONS = [
  { id: 4, label: "4s" },
  { id: 8, label: "8s" },
  { id: 12, label: "12s" },
] as const;

export const VIDEO_ASPECTS = [
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "1:1", label: "1:1" },
] as const;
