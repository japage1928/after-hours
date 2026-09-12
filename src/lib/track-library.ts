/**
 * Completed-track library on this device (IndexedDB).
 * Not the old Write-tab lyrics JSON — these are playable audio files.
 */

import { encodeWav } from "./bounce.ts";
import { GROOVE_STYLES, type GrooveStyle } from "./ai-beat.ts";
import type { BoothMode } from "./booth-mode.ts";

export type SaveableResult = {
  title: string;
  mode: BoothMode;
  buffer: AudioBuffer;
  duration: number;
  bpm?: number;
  engine: "ace-step" | "local-mix";
  summary: string;
  style?: GrooveStyle;
  prompt?: string;
  aceStepBase64?: string;
  aceStepMime?: string;
};

export const LIBRARY_DB_NAME = "after-hours.tracks.v1";
export const LIBRARY_STORE = "tracks";
export const MAX_LIBRARY_TRACKS = 16;
export const LIBRARY_HANDOFF_KEY = "after-hours.library.handoff.v1";

export type LibraryMode = BoothMode | "video";
export type LibraryEngine = "ace-step" | "local-mix" | "grok-imagine";
export type LibraryKind = "audio" | "video";

export type SavedTrack = {
  id: string;
  title: string;
  mode: LibraryMode;
  kind?: LibraryKind;
  createdAt: number;
  duration: number;
  bpm?: number;
  engine: LibraryEngine;
  summary: string;
  style?: GrooveStyle;
  prompt?: string;
  mime: string;
  blob: Blob;
};

export type LibraryHandoff =
  | {
      kind: "remix-source";
      trackId: string;
      style?: GrooveStyle;
    }
  | {
      kind: "generate-again";
      prompt: string;
      style: GrooveStyle;
      lyrics?: string;
    };

export function newTrackId(): string {
  return `trk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nextGrooveStyle(current?: string | null): GrooveStyle {
  const ids = GROOVE_STYLES.map((g) => g.id);
  const idx = ids.indexOf(current as GrooveStyle);
  if (idx < 0) return ids[0] ?? "pop";
  return ids[(idx + 1) % ids.length] ?? "pop";
}

export function idsToEvict(
  records: Array<{ id: string; createdAt: number }>,
  max = MAX_LIBRARY_TRACKS,
): string[] {
  if (records.length <= max) return [];
  return [...records]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, records.length - max)
    .map((r) => r.id);
}

export function parseLibraryHandoff(raw: string | null | undefined): LibraryHandoff | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as LibraryHandoff;
    if (v?.kind === "generate-again" && typeof v.prompt === "string" && v.style) {
      return {
        kind: "generate-again",
        prompt: v.prompt,
        style: v.style,
        lyrics: typeof v.lyrics === "string" ? v.lyrics : "",
      };
    }
    if (v?.kind === "remix-source" && typeof v.trackId === "string" && v.trackId) {
      return {
        kind: "remix-source",
        trackId: v.trackId,
        style: v.style,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLibraryHandoff(handoff: LibraryHandoff) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LIBRARY_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    /* ignore */
  }
}

export function takeLibraryHandoff(): LibraryHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LIBRARY_HANDOFF_KEY);
    window.sessionStorage.removeItem(LIBRARY_HANDOFF_KEY);
    return parseLibraryHandoff(raw);
  } catch {
    return null;
  }
}

export function blobFromAceStepBase64(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: mime || "audio/mpeg" });
}

export function audioBlobFromResult(
  result: Pick<SaveableResult, "buffer" | "aceStepBase64" | "aceStepMime">,
): { blob: Blob; mime: string } {
  if (result.aceStepBase64) {
    const mime = result.aceStepMime || "audio/mpeg";
    return { blob: blobFromAceStepBase64(result.aceStepBase64, mime), mime };
  }
  return { blob: encodeWav(result.buffer), mime: "audio/wav" };
}

export function downloadExtension(mime: string): string {
  if (mime.startsWith("video/")) return "mp4";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
    return "m4a";
  }
  return "mp3";
}

export function isVideoTrack(track: Pick<SavedTrack, "mode" | "kind" | "mime" | "engine">): boolean {
  return (
    track.mode === "video" ||
    track.kind === "video" ||
    track.engine === "grok-imagine" ||
    track.mime.startsWith("video/")
  );
}

export function partitionLibrary(tracks: SavedTrack[]): {
  songs: SavedTrack[];
  videos: SavedTrack[];
} {
  const songs: SavedTrack[] = [];
  const videos: SavedTrack[] = [];
  for (const track of tracks) {
    if (isVideoTrack(track)) videos.push(track);
    else songs.push(track);
  }
  return { songs, videos };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const req = indexedDB.open(LIBRARY_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
        db.createObjectStore(LIBRARY_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open library."));
  });
}

function reqAs<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Library request failed."));
  });
}

export async function listSavedTracks(): Promise<SavedTrack[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(LIBRARY_STORE, "readonly");
    const rows = await reqAs(tx.objectStore(LIBRARY_STORE).getAll() as IDBRequest<SavedTrack[]>);
    return (rows ?? []).sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

export async function getSavedTrack(id: string): Promise<SavedTrack | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(LIBRARY_STORE, "readonly");
    const row = await reqAs(tx.objectStore(LIBRARY_STORE).get(id) as IDBRequest<SavedTrack>);
    return row ?? null;
  } finally {
    db.close();
  }
}

export async function deleteSavedTrack(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(LIBRARY_STORE, "readwrite");
    await reqAs(tx.objectStore(LIBRARY_STORE).delete(id));
  } finally {
    db.close();
  }
}

export async function saveStudioResult(
  result: SaveableResult,
  extras?: { style?: GrooveStyle; prompt?: string },
): Promise<SavedTrack> {
  const { blob, mime } = audioBlobFromResult(result);
  const record: SavedTrack = {
    id: newTrackId(),
    title: result.title.slice(0, 120) || "After Hours track",
    mode: result.mode,
    createdAt: Date.now(),
    duration: result.duration,
    bpm: result.bpm,
    engine: result.engine,
    summary: result.summary,
    style: extras?.style ?? result.style,
    prompt: extras?.prompt ?? result.prompt,
    mime,
    blob,
  };
  const db = await openDb();
  try {
    const existing = await reqAs(
      db.transaction(LIBRARY_STORE, "readonly").objectStore(LIBRARY_STORE).getAll() as IDBRequest<
        SavedTrack[]
      >,
    );
    const evict = idsToEvict(
      [...(existing ?? []).map((r) => ({ id: r.id, createdAt: r.createdAt })), record],
      MAX_LIBRARY_TRACKS,
    );
    const tx = db.transaction(LIBRARY_STORE, "readwrite");
    const store = tx.objectStore(LIBRARY_STORE);
    for (const id of evict) store.delete(id);
    store.put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save track."));
    });
  } finally {
    db.close();
  }
  return record;
}

export async function saveVideoClip(opts: {
  title: string;
  duration: number;
  summary: string;
  prompt?: string;
  mime: string;
  base64: string;
}): Promise<SavedTrack> {
  const mime = opts.mime || "video/mp4";
  const record: SavedTrack = {
    id: newTrackId(),
    title: opts.title.slice(0, 120) || "After Hours clip",
    mode: "video",
    kind: "video",
    createdAt: Date.now(),
    duration: opts.duration,
    engine: "grok-imagine",
    summary: opts.summary,
    prompt: opts.prompt,
    mime,
    blob: blobFromAceStepBase64(opts.base64, mime),
  };
  const db = await openDb();
  try {
    const existing = await reqAs(
      db.transaction(LIBRARY_STORE, "readonly").objectStore(LIBRARY_STORE).getAll() as IDBRequest<
        SavedTrack[]
      >,
    );
    const evict = idsToEvict(
      [...(existing ?? []).map((r) => ({ id: r.id, createdAt: r.createdAt })), record],
      MAX_LIBRARY_TRACKS,
    );
    const tx = db.transaction(LIBRARY_STORE, "readwrite");
    const store = tx.objectStore(LIBRARY_STORE);
    for (const id of evict) store.delete(id);
    store.put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save clip."));
    });
  } finally {
    db.close();
  }
  return record;
}
