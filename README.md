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

Without `DATABASE_URL`, auth/session tables run on embedded PGLite. With Supabase connected, Better Auth persists to your project Postgres.

## Stack

TanStack Start, Vite, Tailwind v4, Zustand, Web Audio, Better Auth → **Supabase Postgres**.

## Deploy: Vercel + Supabase

Primary path. Supabase project **`after-hours`** (`qrhnoypojhkjkmzlhjfl`, `us-east-1`) is live with the Better Auth schema (users, sessions, accounts) already applied and RLS enabled for PostgREST.

| Piece | Service |
| --- | --- |
| Hosting | [Vercel](https://vercel.com/new) (Hobby is fine) |
| Database + auth storage | [Supabase](https://supabase.com/dashboard/project/qrhnoypojhkjkmzlhjfl) **after-hours** |

### Connect them

1. Import this GitHub repo into [Vercel](https://vercel.com/new).
2. Preferred: Vercel project → **Integrations → Supabase** → link **after-hours**. That syncs `POSTGRES_URL` (and related vars). The app already accepts those names.
3. Or set env vars manually:
   - `DATABASE_URL` — Supabase **Transaction pooler** URI ([Connect](https://supabase.com/dashboard/project/qrhnoypojhkjkmzlhjfl?showConnect=true)) with your DB password
   - `XAI_API_KEY` — optional, for mash plans / Write vocals
   - `VITE_AUTH_ENABLED=true` — so deployed sign-in is on
4. Redeploy. Build runs `db:migrate` against Supabase.

Project URL: `https://qrhnoypojhkjkmzlhjfl.supabase.co`

### Note on Neon

A Neon Free project was created earlier while exploring a $0 path. You can delete it in the [Neon console](https://console.neon.tech/app/projects/frosty-dream-64435061) if you are not using it — After Hours is wired for Supabase.
