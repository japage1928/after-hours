# After Hours

**Two studios:** Songs (Generate / Remix / Mashup) and a separate Video page. Not one blended booth.

## Architecture (read this if you expected Demucs)

| Piece | What it actually is | Needed to sell songs? |
| --- | --- | --- |
| **ACE-Step via Replicate** | Text → full song (Generate / AI Remix). Default model `fishaudio/ace-step-1.5`. | **Yes.** Set `REPLICATE_API_TOKEN` on Vercel Production. |
| **`ACE_STEP_BASE_URL`** | Optional self-hosted OpenAI-compat ACE-Step host. | **No.** Production does not have this, and does not need it. |
| **Demucs** | Stem split (vocals vs instrumental) from old Mashup Pro / `main`. | **No.** Not used on this branch. Do not add it. |
| **Mashup** | Client bounce: beats of one owned track × lyrics of another. | Works with zero AI env vars. |
| **Stripe / auth** | Checkout + Better Auth. | Already set in Production. |

Missing `ACE_STEP_*` on Production is expected. The only Generate blocker is `REPLICATE_API_TOKEN`.

## Session one

Cold signup → Generate booth → prompt/style → generate → play + download.

- **Generate** needs `REPLICATE_API_TOKEN` on Vercel. There is no fake song.
- Free accounts get **2 AI generates per month**. Paywall after those jobs, then Stripe Checkout.
- Finished generates save to **Library** (`/projects`), labeled separately from Video clips.

## How Generate works (`/generate`)

1. Prompt (required), style chips, length (~30 / ~60 / ~90s), optional lyrics, optional instrumental.
2. **xAI** (if `XAI_API_KEY` is set) translates that into an ACE-Step caption + lyrics. Otherwise a local brief is used.
3. **ACE-Step** generates the audio:
   - Default: Replicate `fishaudio/ace-step-1.5` using only `REPLICATE_API_TOKEN`
   - Optional: `lucataco/ace-step` (v1, `tags` instead of `prompt`) via `ACE_STEP_REPLICATE_MODEL`
   - Optional override: `ACE_STEP_BASE_URL` (OpenAI-compat host) if you self-host — wins over Replicate
4. Play + download. Track is saved to the on-device library.

UI copy when Replicate is live: **AI generation powered by ACE-Step (via Replicate)**.

## How Video works (`/video`)

Video is a **separate studio**, not a fourth Songs tab.

1. Human prompt (duration 4 / 8 / 12s, aspect 16:9 · 9:16 · 1:1).
2. **Grok** (`grok-4.5` via `XAI_API_KEY`) expands it into an Imagine prompt. Local fallback if chat is down.
3. **Grok Imagine** (`grok-imagine-video-1.5`) via `POST https://api.x.ai/v1/videos/generations`, then poll `GET /v1/videos/{request_id}` until done. Docs: https://docs.x.ai/developers/model-capabilities/video/generation
4. **Grok QA** of the prompt + result metadata (and `respect_moderation` if returned). Unsafe / empty / off-brief → human error, no library success, quota refunded.
5. Play + download. Clip saves under Library → Videos.

Honest label: **Prompt + QA by Grok / xAI; video by Grok Imagine**.

We did **not** wire the inactive n8n “Video Studio” workflows. In-app server functions + the existing `XAI_API_KEY` is the shorter path (same auth/quota rails, no extra webhook hop).

Cost: Imagine is about **$0.08/sec** (`grok-imagine-video-1.5`). An 8s clip is ~$0.64 — more than an ACE-Step song. It still spends **one** shared AI job on the free/sub quota.

## Env vars

| Var | Used for |
| --- | --- |
| `REPLICATE_API_TOKEN` | **Required to go live.** ACE-Step via Replicate for Generate. Create at https://replicate.com/account/api-tokens and add a payment method. |
| `ACE_STEP_REPLICATE_MODEL` | Optional. Default `fishaudio/ace-step-1.5`. |
| `ACE_STEP_BASE_URL` | Optional self-hosted ACE-Step host (used instead of Replicate if set). **Not required.** |
| `ACE_STEP_API_KEY` / `ACE_STEP_MODEL` | Optional for the self-hosted host only. |
| `XAI_API_KEY` | Optional for Songs prompt translation. **Required for Video** (prompt + Imagine + QA). |
| `XAI_VIDEO_MODEL` | Optional. Default `grok-imagine-video-1.5`. |
| `DATABASE_URL` / `POSTGRES_URL` | Supabase Postgres for Better Auth + billing. |
| `VITE_AUTH_ENABLED` | `true` on Vercel so sign-in is on. |
| `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET` | Auth. |
| `STRIPE_*` | Checkout + portal (already set in production). |

**To go live:** Vercel → Production → Environment Variables → add `REPLICATE_API_TOKEN` → Redeploy. Optional: `XAI_API_KEY`. Do not wait on `ACE_STEP_*` or Demucs.

## Gaps vs Suno

- Engine is ACE-Step via Replicate, not Suno — different model, no custom personas, no social feed, no stems marketplace.
- Remix shares the same ACE-Step engine; it is not neural stem split / Demucs.
- Mashup is on-device EQ bounce of two owned tracks.
- No TikTok / Facebook login.

## Run locally

```bash
npm install
export REPLICATE_API_TOKEN=r8_...
npm run dev
```

Open the app, sign in, **Generate**.

Without `DATABASE_URL`, auth/session tables run on embedded PGLite. With Supabase connected, Better Auth persists to your project Postgres.

## Stack

TanStack Start, Vite, Tailwind v4, Zustand, Web Audio, Better Auth → **Supabase Postgres**, Stripe, ACE-Step (Replicate), xAI Grok Imagine.

## Deploy: Vercel + Supabase

Primary path. Supabase project **`after-hours`** (`qrhnoypojhkjkmzlhjfl`, `us-east-1`) is live with the Better Auth schema already applied.

| Piece | Service |
| --- | --- |
| Hosting | [Vercel](https://vercel.com/new) |
| Database + auth storage | [Supabase](https://supabase.com/dashboard/project/qrhnoypojhkjkmzlhjfl) **after-hours** |

### Connect them

1. Import this GitHub repo into [Vercel](https://vercel.com/new).
2. Preferred: Vercel project → **Integrations → Supabase** → link **after-hours**.
3. Or set env vars manually (`REPLICATE_API_TOKEN`, `DATABASE_URL`, `VITE_AUTH_ENABLED=true`, Stripe keys). Optional: `XAI_API_KEY`. Do not set `ACE_STEP_BASE_URL` unless you self-host.
4. Redeploy. Build runs `db:migrate` against Supabase.

Project URL: `https://qrhnoypojhkjkmzlhjfl.supabase.co`

### Note on Neon

A Neon Free project was created earlier while exploring a $0 path. After Hours on this branch is wired for Supabase — do not target the diverged `main` Mashup Pro / Netlify / Neon stack.
