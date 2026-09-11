import { create } from "zustand";
import { engine, type Mix } from "@/lib/audio-engine";
import { generateSong, renderVocal } from "@/lib/song-api";
import type { GenerateInput, Length, Mode, Song } from "@/lib/types";
import { voiceIdFor, vocalistById } from "@/lib/vocalists";

const LIBRARY_KEY = "after-hours.library.v1";

function readLibrary(): Song[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Song[];
    return Array.isArray(parsed)
      ? parsed.filter((s) => s && s.id && s.sections && !s.isDemo)
      : [];
  } catch {
    return [];
  }
}

function writeLibrary(songs: Song[]) {
  if (typeof window === "undefined") return;
  const persist = songs.filter((s) => !s.isDemo).slice(0, 24);
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(persist));
}

export type Status = "idle" | "writing" | "rendering" | "ready" | "error";

type StudioState = {
  prompt: string;
  mode: Mode;
  explicit: boolean;
  genre: string;
  vocalistA: string;
  vocalistB: string;
  length: Length;
  song: Song | null;
  library: Song[];
  libraryOpen: boolean;
  status: Status;
  statusText: string;
  error: string | null;
  playing: boolean;
  beats: number;
  durationBeats: number;
  mix: Mix;
  vocalsReady: Record<string, boolean>;
  setPrompt: (v: string) => void;
  setMode: (v: Mode) => void;
  setExplicit: (v: boolean) => void;
  setGenre: (v: string) => void;
  setVocalistA: (v: string) => void;
  setVocalistB: (v: string) => void;
  setLength: (v: Length) => void;
  setLibraryOpen: (v: boolean) => void;
  setMix: (mix: Partial<Mix>) => void;
  hydrate: () => void;
  loadSong: (song: Song, render?: boolean) => void;
  cutTrack: () => Promise<void>;
  renderCurrentVocals: () => Promise<void>;
  mashSelected: (a: Song, b: Song) => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (beats: number) => void;
  stop: () => void;
};

let gen = 0;
let tickBound = false;

async function mapPool<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function renderVocalsFor(
  song: Song,
  my: number,
  markReady: (sectionId: string) => void,
): Promise<void> {
  await engine.ensure();
  const parts = song.sections.filter((s) => s.lyrics.trim().length > 0);
  await mapPool(parts, 2, async (section) => {
    if (my !== gen) return;
    const voice = voiceIdFor(section.vocalistId);
    const res = await renderVocal({
      data: {
        text: section.lyrics,
        voiceId: voice,
        vocalMode: song.vocalMode,
        kind: section.kind,
      },
    });
    if (my !== gen) return;
    if (!res.ok) return;
    try {
      const buf = await engine.decode(b64ToBuf(res.audio));
      engine.attachVocal(section.id, buf);
      markReady(section.id);
    } catch {
      /* keep synth vocal */
    }
  });
}

export const useStudio = create<StudioState>((set, get) => ({
  prompt: "",
  mode: "solo",
  explicit: true,
  genre: "trap",
  vocalistA: "diesel",
  vocalistB: "sal",
  length: "cut",
  song: null,
  library: [],
  libraryOpen: false,
  status: "idle",
  statusText: "Write a cut to fill the shelf.",
  error: null,
  playing: false,
  beats: 0,
  durationBeats: 0,
  mix: { beat: 0.78, vocals: 0.92, bass: 0.86 },
  vocalsReady: {},

  setPrompt: (prompt) => set({ prompt }),
  setMode: (mode) => set({ mode }),
  setExplicit: (explicit) => set({ explicit }),
  setGenre: (genre) => set({ genre }),
  setVocalistA: (vocalistA) => set({ vocalistA }),
  setVocalistB: (vocalistB) => set({ vocalistB }),
  setLength: (length) => set({ length }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setMix: (mix) => {
    engine.setMix(mix);
    set((s) => ({ mix: { ...s.mix, ...mix } }));
  },

  hydrate: () => {
    const library = readLibrary();
    const song = get().song ?? library[0] ?? null;
    if (song) engine.load(song);
    else engine.stop();
    set({
      library,
      song,
      durationBeats: song ? engine.durationBeats() : 0,
      statusText: song
        ? "Ready"
        : library.length
          ? "Pick a cut from the shelf."
          : "Write a cut to fill the shelf.",
    });
    if (!tickBound) {
      tickBound = true;
      engine.onTick((beats, durationBeats) => {
        set({
          beats,
          durationBeats,
          playing: engine.isPlaying(),
        });
      });
    }
  },

  loadSong: (song, render = false) => {
    engine.load(song);
    set({
      song,
      vocalsReady: {},
      beats: 0,
      durationBeats: engine.durationBeats(),
      status: "ready",
      statusText: "Ready",
      error: null,
      playing: false,
    });
    if (render) {
      const my = ++gen;
      set({ status: "rendering", statusText: "Pulling vocals into the booth" });
      void renderVocalsFor(song, my, (id) => {
        set((st) => ({ vocalsReady: { ...st.vocalsReady, [id]: true } }));
      }).then(() => {
        if (my !== gen) return;
        set({ status: "ready", statusText: "Vocals in the mix" });
      });
    }
  },

  cutTrack: async () => {
    const s = get();
    const prompt = s.prompt.trim();
    if (prompt.length < 2) {
      set({ error: "Write a spark first.", status: "error" });
      return;
    }
    if (s.mode === "mashup" && s.vocalistA === s.vocalistB) {
      set({ error: "Pick two different voices to mash.", status: "error" });
      return;
    }
    const my = ++gen;
    set({ status: "writing", statusText: "Writing the cut", error: null, playing: false });
    engine.stop();
    const input: GenerateInput = {
      prompt,
      mode: s.mode,
      explicit: s.explicit,
      genre: s.genre,
      vocalistA: s.vocalistA,
      vocalistB: s.mode === "mashup" ? s.vocalistB : null,
      length: s.length,
      mashSources: null,
    };
    let res: Awaited<ReturnType<typeof generateSong>>;
    try {
      res = await generateSong({ data: input });
    } catch (err) {
      if (my !== gen) return;
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Could not write the cut.",
        statusText: "Could not write it",
      });
      return;
    }
    if (my !== gen) return;
    if (!res.ok) {
      set({ status: "error", error: res.error, statusText: "Could not write it" });
      return;
    }
    const song = res.song;
    engine.load(song);
    const library = [song, ...get().library.filter((x) => x.id !== song.id)].slice(0, 28);
    writeLibrary(library);
    set({
      song,
      library,
      vocalsReady: {},
      beats: 0,
      durationBeats: engine.durationBeats(),
      status: "rendering",
      statusText: "Beat is up. Pulling vocals",
    });
    try {
      await engine.play();
    } catch {
      /* autoplay may need a second tap */
    }
    await renderVocalsFor(song, my, (id) => {
      set((st) => ({ vocalsReady: { ...st.vocalsReady, [id]: true } }));
    });
    if (my !== gen) return;
    set({ status: "ready", statusText: "Vocals in the mix" });
  },

  renderCurrentVocals: async () => {
    const song = get().song;
    if (!song) return;
    const my = ++gen;
    set({ status: "rendering", statusText: "Pulling vocals into the booth", error: null });
    await renderVocalsFor(song, my, (id) => {
      set((st) => ({ vocalsReady: { ...st.vocalsReady, [id]: true } }));
    });
    if (my !== gen) return;
    set({ status: "ready", statusText: "Vocals in the mix" });
  },

  mashSelected: async (a, b) => {
    const lyricsA = a.sections.map((s) => s.lyrics).filter(Boolean).join("\n");
    const lyricsB = b.sections.map((s) => s.lyrics).filter(Boolean).join("\n");
    const my = ++gen;
    set({
      status: "writing",
      statusText: "Mashing the two cuts",
      error: null,
      mode: "mashup",
      vocalistA: a.vocalistA,
      vocalistB: b.vocalistB ?? b.vocalistA,
      prompt: `Mash ${a.title} with ${b.title}`,
      libraryOpen: false,
    });
    engine.stop();
    let res: Awaited<ReturnType<typeof generateSong>>;
    try {
      res = await generateSong({
      data: {
        prompt: `Fuse "${a.title}" and "${b.title}" into one original mashup. Keep the heat of both. New lyrics, not copies.`,
        mode: "mashup",
        explicit: a.explicit || b.explicit,
        genre: a.genre,
        vocalistA: a.vocalistA,
        vocalistB: b.vocalistB ?? b.vocalistA,
        length: "cut",
        mashSources: {
          titleA: a.title,
          lyricsA,
          titleB: b.title,
          lyricsB,
        },
      },
      });
    } catch (err) {
      if (my !== gen) return;
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Mash failed.",
        statusText: "Mash failed",
      });
      return;
    }
    if (my !== gen) return;
    if (!res.ok) {
      set({ status: "error", error: res.error, statusText: "Mash failed" });
      return;
    }
    const song = res.song;
    engine.load(song);
    const library = [song, ...get().library.filter((x) => x.id !== song.id)].slice(0, 28);
    writeLibrary(library);
    set({
      song,
      library,
      vocalsReady: {},
      status: "rendering",
      statusText: "Mash is up. Pulling both voices",
      durationBeats: engine.durationBeats(),
    });
    try {
      await engine.play();
    } catch {
      /* */
    }
    await renderVocalsFor(song, my, (id) => {
      set((st) => ({ vocalsReady: { ...st.vocalsReady, [id]: true } }));
    });
    if (my !== gen) return;
    set({ status: "ready", statusText: "Both voices in the mix" });
  },

  togglePlay: async () => {
    await engine.ensure();
    if (!get().song) return;
    if (engine.isPlaying()) {
      engine.pause();
      set({ playing: false });
    } else {
      await engine.play();
      set({ playing: true });
    }
  },

  seek: (beats) => {
    engine.seek(beats);
    set({ beats, playing: engine.isPlaying() });
  },

  stop: () => {
    engine.stop();
    set({ playing: false, beats: 0 });
  },
}));

export function currentSection(song: Song | null, beats: number) {
  if (!song) return null;
  let acc = 0;
  for (const section of song.sections) {
    const len = section.bars * 4;
    if (beats < acc + len) {
      return { section, start: acc, local: beats - acc, duration: len };
    }
    acc += len;
  }
  const last = song.sections[song.sections.length - 1];
  if (!last) return null;
  return { section: last, start: acc, local: 0, duration: last.bars * 4 };
}

export function songVoices(song: Song): string {
  const a = vocalistById(song.vocalistA).name;
  if (song.mode === "mashup" && song.vocalistB) {
    return `${a} × ${vocalistById(song.vocalistB).name}`;
  }
  return a;
}
