# After Hours

Creator booth with three modes:

1. **Generate** — describe a song (prompt / style / optional lyrics) and get an AI-generated full track you can play and download
2. **Remix** — upload a song you own; AI rebuilds it onto a new beat/style (EDM, dubstep, rock, country, …)
3. **Mashup** — two owned tracks: beats from one, lyrics/vocals from the other, bounced into one listen

Auth, billing, **device library**, and admin sit around that booth. This is not a DJ-crossfade demo and not a hidden Write tab.

Generation is **ACE-Step** (not Suno). The booth labels the engine honestly.

## Session one

Cold signup → pick Generate, Remix, or Mashup → play + download before you leave.

- **Generate** needs `ACE_STEP_BASE_URL`. There is no fake song.
- **Remix** uses ACE-Step when configured. If it isn’t, the primary remix still finishes on a **labeled local drum-bed** (not ACE-Step, no AI quota).
- **Mashup** always runs in the browser. Two owned files, or lyrics + a labeled local preview beat.

Free accounts get **2 AI generates/remixes per month**. Mashups don’t spend that quota. The paywall appears after those jobs are used — not before the first track. Finished audio saves to **Library** (`/projects`) with Remix this / Try another style.

Need help? `/help` emails the owner. Ticket UI can land separately.

## How each mode works

### Generate (`/generate`)

1. Prompt (required), style chips, length (~30 / ~60 / ~90s), optional lyrics, optional instrumental.
2. **xAI** (if `XAI_API_KEY` is set) translates that into an ACE-Step caption + lyrics. Otherwise a local brief is used.
3. **ACE-Step** (`ACE_STEP_BASE_URL`) generates the audio.
4. Play + download (original ACE-Step payload when available).

Generate **requires** ACE-Step. There is no fake song if the model isn’t configured.

### Remix (`/remix`)

1. Upload one owned track (M4A/MP3/WAV, under 40 MB).
2. Pick a style + optional brief.
3. xAI → ACE-Step instrumental bed matching the song length.
4. Client **bounce**: high-pass the original over the new bed, beat-matched, full duration — a real listen, not an intro→tease→drop DJ show.
5. Play + download WAV.

If ACE-Step isn’t configured, Remix still finishes with a **labeled local drum-bed preview** (not ACE-Step, no quota). You can also pick that path on purpose.

### Mashup (`/mashup`)

1. Load beats (A) and lyrics/vocals (B) you own.
2. Bounce: time-stretch lyrics to the beat BPM, EQ-split (kick/bass vs vocal), 2-bar intro, then lock both.
3. Play + download WAV. Runs on-device; does not spend AI quota. If you only have vocals, mash over a **labeled local preview beat**.

## Env vars

| Var | Used for |
| --- | --- |
| `XAI_API_KEY` | Prompt → ACE-Step caption/lyrics (Generate + Remix). Optional; local briefs work without it. |
| `ACE_STEP_BASE_URL` | ACE-Step host (no trailing slash). **Required** for Generate and AI Remix. |
| `ACE_STEP_API_KEY` | Optional bearer token for that host. |
| `ACE_STEP_MODEL` | Default `acestep/ACE-Step-v1.5`. |
| `DATABASE_URL` / `POSTGRES_URL` | Supabase Postgres for Better Auth + billing. |
| `VITE_AUTH_ENABLED` | `true` on Vercel so sign-in is on. |
| `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET` | Auth. |
| `STRIPE_*` | Checkout + portal. Not rewritten in this product pass. |

## Gaps vs Suno

- Engine is ACE-Step, not Suno — different model, no custom personas, no social feed, no stems marketplace.
- Remix does not do neural stem split or audio-to-audio “cover”; it generates a new bed and bounces your source on top.
- Mashup is beat-match + EQ, not lyric-aware stem isolation.
- No TikTok login.

## Run locally

```bash
npm install
export XAI_API_KEY=your_key
# export ACE_STEP_BASE_URL=https://your-ace-step-host
npm run dev
```

Open the app, sign in, pick **Generate**, **Remix**, or **Mashup**.

On iPhone, pick an **M4A** or **MP3** from Files, Downloads, or Voice Memos. Apple Music catalog tracks cannot be uploaded. Keep each file under 40 MB.

Without `DATABASE_URL`, auth/session tables run on embedded PGLite. With Supabase connected, Better Auth persists to your project Postgres.

## Stack

TanStack Start, Vite, Tailwind v4, Zustand, Web Audio, Better Auth → **Supabase Postgres**, Stripe, ACE-Step, xAI.

## Deploy: Vercel + Supabase

Primary path. Supabase project **`after-hours`** (`qrhnoypojhkjkmzlhjfl`, `us-east-1`) is live with the Better Auth schema already applied.

| Piece | Service |
| --- | --- |
| Hosting | [Vercel](https://vercel.com/new) |
| Database + auth storage | [Supabase](https://supabase.com/dashboard/project/qrhnoypojhkjkmzlhjfl) **after-hours** |

### Connect them

1. Import this GitHub repo into [Vercel](https://vercel.com/new).
2. Preferred: Vercel project → **Integrations → Supabase** → link **after-hours**.
3. Or set env vars manually (`DATABASE_URL`, `XAI_API_KEY`, `ACE_STEP_*`, `VITE_AUTH_ENABLED=true`, Stripe keys).
4. Redeploy. Build runs `db:migrate` against Supabase.

Project URL: `https://qrhnoypojhkjkmzlhjfl.supabase.co`

### Note on Neon

A Neon Free project was created earlier while exploring a $0 path. After Hours on this branch is wired for Supabase — do not target the diverged `main` Mashup Pro / Netlify / Neon stack.
