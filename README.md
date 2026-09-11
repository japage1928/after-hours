# After Hours

Late-night mashup studio. Load **Song A** and **Song B**, mash them into one beat-matched cut. Optional **Write** tab for original songs.

## What it does

- Drop two audio files (mp3, wav, m4a, ogg, flac) you have the right to mix
- Detects BPM, beat-matches, and crossfades into a single mash
- Ships with two original loops so you can mash immediately
- Write original lyrics and vocals on the Write tab (xAI)

Does not pull catalog tracks or clone celebrity voices.

On iPhone, tap **Choose** on Song A / Song B and pick an **M4A** or **MP3** from Files, Downloads, or Voice Memos. Apple Music catalog tracks cannot be uploaded.

## Run locally

```bash
npm install
export XAI_API_KEY=your_key
npm run dev
```

Open the app, hit **Mash**. Set `XAI_API_KEY` for AI mix plans and vocal writing; mash still works without it using a local blend plan.

## Stack

TanStack Start, Vite, Tailwind v4, Zustand, Web Audio.

## Deploy (Vercel + Supabase)

A Supabase project **`after-hours`** (`qrhnoypojhkjkmzlhjfl`, `us-east-1`) is ready with the auth schema applied. The app already builds with the Vercel Nitro preset.

### Connect them

1. Import the GitHub repo into [Vercel](https://vercel.com/new).
2. In the Vercel project, open **Integrations → Supabase** (or [vercel.com/integrations/supabase](https://vercel.com/integrations/supabase)) and link the **after-hours** Supabase project. That syncs `POSTGRES_URL` (and related vars) into Vercel.
3. Or set env vars manually in Vercel:
   - `DATABASE_URL` — Supabase **Transaction pooler** URI (Dashboard → Connect), password filled in
   - `XAI_API_KEY` — for mash plans / Write vocals
4. Redeploy. Build runs `db:migrate` against that URL.

Local/preview still works without a database URL (embedded PGLite).
