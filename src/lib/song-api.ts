import { createServerFn } from "@tanstack/react-start";
import {
  GenerateInputSchema,
  RenderVocalInputSchema,
  SongSchema,
  type Song,
  type SongSection,
} from "@/lib/types";
import { uid } from "@/lib/utils";
import { vocalistById, VOCALISTS } from "@/lib/vocalists";
import { genreById } from "@/lib/genres";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  assertAiAllowed,
  chargeAfterLyrics,
  chargeAfterVocal,
} from "@/lib/billing/gate";

const MINOR_SEX =
  /\b(child|children|kid|kids|minor|minors|underage|teen|teens|teenage|preteen|loli|pedo)\b/i;

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The writer returned no song JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

function lengthGuide(length: "hook" | "cut" | "full"): string {
  if (length === "hook") {
    return "Structure: 4-bar instrumental intro, then one 8-bar chorus only. Tight hook.";
  }
  if (length === "full") {
    return "Structure: 4-bar intro, 8-bar verse, 8-bar chorus, 8-bar verse, 8-bar chorus, 8-bar bridge, 8-bar chorus.";
  }
  return "Structure: 4-bar instrumental intro, 8-bar verse, 8-bar chorus. Radio cut.";
}

function syllableBudget(bars: number, bpm: number, mode: string): string {
  const beats = bars * 4;
  const perBeat = mode === "sung" ? 2 : 3;
  return `Max ~${beats * perBeat} syllables. Must be performable in ${bars} bars at ${bpm} BPM. Newline-separated lines.`;
}

export const generateSong = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => GenerateInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; song: Song } | { ok: false; error: string }> => {
    const blocked = await assertAiAllowed(context.userId, {
      allowSongBundle: true,
    });
    if (blocked) return { ok: false, error: blocked };

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available in this environment." };

    const prompt = data.prompt.toLowerCase();
    const sexual =
      /\b(sex|sexual|nude|naked|porn|fuck|explicit|nsfw|hookup)\b/i.test(data.prompt);
    if (sexual && MINOR_SEX.test(prompt)) {
      return { ok: false, error: "Can't write sexual content involving minors." };
    }

    const a = vocalistById(data.vocalistA);
    const b = data.mode === "mashup" ? vocalistById(data.vocalistB ?? "") : null;
    const genre = genreById(data.genre);
    const roster = VOCALISTS.map((v) => `${v.id}: ${v.name} (${v.lane}, ${v.tone})`).join("\n");

    const mash =
      data.mashSources &&
      `Mash these two original cuts into a new original song. Do not copy copyrighted material.
A: "${data.mashSources.titleA}"
${data.mashSources.lyricsA.slice(0, 800)}
B: "${data.mashSources.titleB}"
${data.mashSources.lyricsB.slice(0, 800)}`;

    const system = `You are a hit songwriter and producer for After Hours, a late-night studio.
Write ORIGINAL songs only. Never copy existing lyrics, never quote famous hooks.
If the user names a real artist, treat that as STYLE inspiration only. Do not impersonate them, do not use their name in the lyrics, do not copy their catalog.
Adult/explicit content is allowed and expected when requested: real swear words, sex, violence, drugs between consenting adults. Do not bowdlerize. Do not fade to "heck" or "freaking".
Never write sexual content involving anyone 17 or under.
Output JSON only, no markdown.`;

    const user = `Write a ${data.explicit ? "EXPLICIT, uncensored" : "clean-radio"} ${genre.label} song.
Prompt: ${data.prompt}
${mash ? `\n${mash}\n` : ""}
Mode: ${data.mode}${b ? ` mashup between ${a.name} and ${b.name}` : ` solo for ${a.name}`}.
Lead vocalist id: ${a.id}. ${b ? `Featured vocalist id: ${b.id}. Alternate: verses = ${a.id}, chorus = ${b.id}, bridge = ${a.id}.` : ""}
${lengthGuide(data.length)}
Default BPM around ${genre.defaultBpm} unless the prompt demands otherwise.
${syllableBudget(8, genre.defaultBpm, a.delivery)}
Vocalists:
${roster}

JSON shape:
{
  "title": "short punchy title",
  "subtitle": "4-8 word kicker",
  "bpm": number,
  "key": "A minor",
  "genre": "${genre.id}",
  "explicit": ${data.explicit},
  "vocalMode": "rap" | "sung" | "hybrid",
  "mood": "one line",
  "sections": [
    {
      "id": "intro",
      "label": "Intro",
      "kind": "intro" | "verse" | "chorus" | "bridge" | "outro",
      "bars": 4 or 8,
      "vocalistId": "${a.id}",
      "lyrics": "newline separated. empty string for instrumental intro/outro",
      "chords": ["Am","F","C","G"]
    }
  ]
}`;

    const run = async () => {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(35000),
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.95,
          max_tokens: 1800,
          reasoning_effort: "low",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Writer failed (${res.status})${body ? `: ${body.slice(0, 180)}` : ""}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return json.choices?.[0]?.message?.content ?? "";
    };

    try {
      let text = "";
      try {
        text = await run();
      } catch (err) {
        text = await run();
        if (!text) throw err;
      }
      const parsed = extractJson(text);
      const raw = parsed as Record<string, unknown>;
      const sectionsIn = Array.isArray(raw.sections) ? raw.sections : [];
      const sections: SongSection[] = sectionsIn.slice(0, 8).map((s, i) => {
        const row = (s ?? {}) as Record<string, unknown>;
        const kindRaw = String(row.kind ?? "verse");
        const kind =
          kindRaw === "intro" ||
          kindRaw === "verse" ||
          kindRaw === "chorus" ||
          kindRaw === "bridge" ||
          kindRaw === "outro"
            ? kindRaw
            : "verse";
        const vid = String(row.vocalistId ?? a.id);
        const known = VOCALISTS.some((v) => v.id === vid) ? vid : a.id;
        const chords = Array.isArray(row.chords)
          ? row.chords.map(String).slice(0, 8)
          : ["Am", "F", "C", "G"];
        return {
          id: String(row.id ?? `${kind}-${i}`),
          label: String(row.label ?? kind),
          kind,
          bars: Math.min(16, Math.max(2, Number(row.bars) || (kind === "intro" ? 4 : 8))),
          vocalistId: known,
          lyrics: String(row.lyrics ?? "").slice(0, 900),
          chords: chords.length ? chords : ["Am", "F", "C", "G"],
        };
      });
      if (!sections.length) {
        return { ok: false, error: "The writer returned an empty arrangement." };
      }
      const song = SongSchema.parse({
        id: uid("cut"),
        title: String(raw.title ?? "Untitled Cut").slice(0, 80),
        subtitle: String(raw.subtitle ?? "").slice(0, 120),
        bpm: Math.min(180, Math.max(64, Number(raw.bpm) || genre.defaultBpm)),
        key: String(raw.key ?? "A minor").slice(0, 24),
        genre: String(raw.genre ?? genre.id).slice(0, 24),
        explicit: Boolean(raw.explicit ?? data.explicit),
        vocalMode:
          raw.vocalMode === "rap" || raw.vocalMode === "sung" || raw.vocalMode === "hybrid"
            ? raw.vocalMode
            : a.delivery === "rap"
              ? "rap"
              : a.delivery === "sung"
                ? "sung"
                : "hybrid",
        mood: String(raw.mood ?? "").slice(0, 160),
        prompt: data.prompt,
        mode: data.mode,
        vocalistA: a.id,
        vocalistB: b?.id ?? null,
        sections,
        createdAt: new Date().toISOString(),
      });
      try {
        await chargeAfterLyrics(context.userId);
      } catch (chargeErr) {
        return {
          ok: false,
          error:
            chargeErr instanceof Error
              ? chargeErr.message
              : "Could not record usage for this song.",
        };
      }
      return { ok: true, song };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not write the cut.";
      return { ok: false, error: message };
    }
  });

function speakScript(
  lyrics: string,
  vocalMode: "rap" | "sung" | "hybrid",
  kind: string,
): { text: string; speed: number } {
  const lines = lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);
  const sung = vocalMode === "sung" || (vocalMode === "hybrid" && kind === "chorus");
  if (sung) {
    return {
      text: `<sing>\n${lines.join("\n")}\n</sing>`,
      speed: 0.92,
    };
  }
  return {
    text: lines.map((l) => `<loud>${l}</loud> [pause]`).join("\n"),
    speed: 1.18,
  };
}

export const renderVocal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => RenderVocalInputSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; audio: string; mime: string } | { ok: false; error: string }> => {
      const blocked = await assertAiAllowed(context.userId, {
        allowSongBundle: true,
      });
      if (blocked) return { ok: false, error: blocked };

      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return { ok: false, error: "AI is not available in this environment." };

      const { text, speed } = speakScript(data.text, data.vocalMode, data.kind);
      const body = {
        text: text.slice(0, 1200),
        voice_id: data.voiceId,
        language: "en",
        speed,
      };

      const run = async () => {
        const res = await fetch("https://api.x.ai/v1/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Voice failed (${res.status})${errText ? `: ${errText.slice(0, 160)}` : ""}`);
        }
        const mime = res.headers.get("content-type") ?? "audio/mpeg";
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let s = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          s += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return { audio: btoa(s), mime };
      };

      try {
        let out: { audio: string; mime: string };
        try {
          out = await run();
        } catch {
          out = await run();
        }
        try {
          await chargeAfterVocal(context.userId, data.text);
        } catch (chargeErr) {
          return {
            ok: false,
            error:
              chargeErr instanceof Error
                ? chargeErr.message
                : "Could not record usage for this vocal.",
          };
        }
        return { ok: true, ...out };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not render vocals.";
        return { ok: false, error: message };
      }
    },
  );
