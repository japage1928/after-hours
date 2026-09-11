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

## Deploy (free): Vercel Hobby + Neon Free

Free path — no paid Supabase required.

| Piece | Plan | Notes |
| --- | --- | --- |
| Hosting | [Vercel Hobby](https://vercel.com) (free) | Import this repo |
| Database | [Neon Free](https://console.neon.tech) project **`after-hours`** (`frosty-dream-64435061`) | Auth schema already applied |

### Connect them

1. Import the GitHub repo into [Vercel](https://vercel.com/new) (Hobby).
2. In Neon → project **after-hours** → **Connect**, copy the **pooled** connection string.
3. In Vercel → Project → **Settings → Environment Variables**, set:
   - `DATABASE_URL` = that Neon URI
   - `XAI_API_KEY` = your xAI key (optional; mash works without it)
4. Redeploy. Build runs `db:migrate` against Neon.

Local/preview still works with no `DATABASE_URL` (embedded PGLite).

### Stop the paid Supabase project

Your Supabase org is **Pro**, so the earlier **`after-hours`** Supabase project (`qrhnoypojhkjkmzlhjfl`) is billable and can’t be paused from here. Delete it in the [Supabase dashboard](https://supabase.com/dashboard/project/qrhnoypojhkjkmzlhjfl/settings/general) to avoid Pro project charges. The app no longer depends on it.
