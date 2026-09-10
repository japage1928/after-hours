/** Accept list tuned for iPhone Files / Voice Memos / desktop pickers. */
export const AUDIO_FILE_ACCEPT = [
  "audio/*",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/flac",
  "audio/webm",
  "audio/x-caf",
  "video/mp4",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".mp4",
  ".caf",
  ".aif",
  ".aiff",
  ".opus",
  ".webm",
].join(",");

const AUDIO_EXT =
  /\.(mp3|wav|wave|m4a|aac|ogg|oga|flac|mp4|caf|aif|aiff|opus|webm)$/i;

export type AudioFileVerdict = "yes" | "maybe" | "no";

/**
 * iPhone Files / Voice Memos often send empty MIME types, application/octet-stream,
 * or video/mp4 for M4A. Prefer extension + MIME, then allow a decode attempt.
 */
export function classifyAudioFile(file: File): AudioFileVerdict {
  const type = (file.type || "").trim().toLowerCase();

  if (
    type.startsWith("image/") ||
    type.startsWith("text/") ||
    type === "application/pdf" ||
    type === "application/json" ||
    type === "application/zip"
  ) {
    return "no";
  }

  // Real video containers (not iOS-mislabelled M4A as video/mp4).
  if (type.startsWith("video/") && type !== "video/mp4") return "no";

  if (type.startsWith("audio/")) return "yes";
  if (AUDIO_EXT.test(file.name)) return "yes";

  // iOS sometimes labels AAC/M4A as video/mp4 (often with a blank or odd name).
  if (type === "video/mp4") return "maybe";

  if (!type || type === "application/octet-stream" || type === "binary/octet-stream") {
    return "maybe";
  }

  return "no";
}

export function displayTrackName(file: File): string {
  const raw = (file.name || "").trim();
  if (!raw || raw === "blob" || raw === "undefined") return "Uploaded track";
  return raw.replace(/\.[^.]+$/, "") || raw;
}

export function audioDecodeErrorMessage(err: unknown): string {
  const base =
    err instanceof Error && err.message && !/unable to decode|encodingerror|notsupported/i.test(err.message)
      ? err.message
      : "Could not decode that track.";
  return `${base} On iPhone, pick an M4A or MP3 from Files or Voice Memos — Apple Music downloads won’t work.`;
}
