import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { SongSchema, type Song } from "@/lib/types";
import { uid } from "@/lib/utils";

export const MashCutSchema = z.object({
  id: z.string(),
  nameA: z.string(),
  nameB: z.string(),
  bpmA: z.number(),
  bpmB: z.number(),
  cue: z.string(),
  createdAt: z.string(),
});
export type MashCut = z.infer<typeof MashCutSchema>;

const MashCutInputSchema = z.object({
  nameA: z.string().min(1).max(120),
  nameB: z.string().min(1).max(120),
  bpmA: z.number().min(40).max(240),
  bpmB: z.number().min(40).max(240),
  cue: z.string().max(400),
});

export const listSongs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Song[]> => {
    const sql = await getSql();
    const rows = await sql<{ payload: string }>`
      select payload from songs
      where user_id = ${context.userId}
      order by created_at desc
      limit 24
    `;
    const songs: Song[] = [];
    for (const row of rows) {
      try {
        const parsed = SongSchema.safeParse(JSON.parse(row.payload));
        if (parsed.success) songs.push({ ...parsed.data, isDemo: false });
      } catch {
        /* skip bad row */
      }
    }
    return songs;
  });

export const saveSong = createServerFn({ method: "POST" })
  .validator((input: unknown) => SongSchema.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data: song }) => {
    const sql = await getSql();
    const payload = JSON.stringify({ ...song, isDemo: false });
    await sql`
      insert into songs (id, user_id, payload)
      values (${song.id}, ${context.userId}, ${payload})
      on conflict (user_id, id) do update set payload = excluded.payload
    `;
  });

export const listMashCuts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MashCut[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name_a: string;
      name_b: string;
      bpm_a: number;
      bpm_b: number;
      cue: string;
      created_at: string;
    }>`
      select id, name_a, name_b, bpm_a, bpm_b, cue, created_at::text as created_at
      from mash_cuts
      where user_id = ${context.userId}
      order by created_at desc
      limit 20
    `;
    return rows.map((row) => ({
      id: row.id,
      nameA: row.name_a,
      nameB: row.name_b,
      bpmA: Number(row.bpm_a),
      bpmB: Number(row.bpm_b),
      cue: row.cue,
      createdAt: row.created_at,
    }));
  });

export const saveMashCut = createServerFn({ method: "POST" })
  .validator((input: unknown) => MashCutInputSchema.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = uid("mash");
    await sql`
      insert into mash_cuts (id, user_id, name_a, name_b, bpm_a, bpm_b, cue)
      values (
        ${id},
        ${context.userId},
        ${data.nameA},
        ${data.nameB},
        ${data.bpmA},
        ${data.bpmB},
        ${data.cue}
      )
    `;
    return { id };
  });
