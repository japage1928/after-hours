# After Hours

**Generate an AI song in the browser** — prompt, play, download. That’s the product.

Remix and mashup still exist in the booth; mashup work is deferred.

Generation is **ACE-Step via Replicate** (not Suno). Optional self-hosted override: `ACE_STEP_BASE_URL`.

## Session one

Cold signup → Generate booth → prompt/style → generate → play + download.

- **Generate** needs `REPLICATE_API_TOKEN` on Vercel (or `ACE_STEP_BASE_URL`). There is no fake song.
- Free accounts get **2 AI generates per month**. Paywall after those jobs, then Stripe Checkout.
- Finished generates save to **Library** (`/projects`).

## How Generate works (`/generate`)

1. Prompt (required), style chips, length (~30 / ~60 / ~90s), optional lyrics, optional instrumental.
2. **xAI** (if `XAI_API_KEY` is set) translates that into an ACE-Step caption + lyrics. Otherwise a local brief is used.
3. **ACE-Step** generates the audio:
   - Default: Replicate model `fishaudio/ace-step-1.5` using `REPLICATE_API_TOKEN`
   - Override: `ACE_STEP_BASE_URL` (OpenAI-compat host) if set
4. Play + download. Track is saved to the on-device library.

## Env vars

| Var | Used for |
| --- | --- |
| `REPLICATE_API_TOKEN` | **Required to go live.** ACE-Step via Replicate for Generate. |
| `ACE_STEP_REPLICATE_MODEL` | Optional. Default `fishaudio/ace-step-1.5`. |
| `ACE_STEP_BASE_URL` | Optional self-hosted ACE-Step host (used instead of Replicate if set). |
| `ACE_STEP_API_KEY` / `ACE_STEP_MODEL` | Optional for the self-hosted host. |
| `XAI_API_KEY` | Optional prompt translator; local briefs work without it. |
| `DATABASE_URL` / `POSTGRES_URL` | Supabase Postgres for Better Auth + billing. |
| `VITE_AUTH_ENABLED` | `true` on Vercel so sign-in is on. |
| `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET` | Auth. |
| `STRIPE_*` | Checkout + portal (already set in production). |

**To go live:** set `REPLICATE_API_TOKEN` on Vercel Production (Stripe is already set). Mashup deferred.

## Gaps vs Suno

- Engine is ACE-Step via Replicate, not Suno — different model, no custom personas, no social feed, no stems marketplace.
- Remix (if used) shares the same ACE-Step engine; it is not neural stem split.
- Mashup is deferred.
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

TanStack Start, Vite, Tailwind v4, Zustand, Web Audio, Better Auth → **Supabase Postgres**, Stripe, ACE-Step (Replicate), xAI.

## Deploy: Vercel + Supabase

Primary path. Supabase project **`after-hours`** (`qrhnoypojhkjkmzlhjfl`, `us-east-1`) is live with the Better Auth schema already applied.

| Piece | Service |
| --- | --- |
| Hosting | [Vercel](https://vercel.com/new) |
| Database + auth storage | [Supabase](https://supabase.com/dashboard/project/qrhnoypojhkjkmzlhjfl) **after-hours** |

### Connect them

1. Import this GitHub repo into [Vercel](https://vercel.com/new).
2. Preferred: Vercel project → **Integrations → Supabase** → link **after-hours**.
3. Or set env vars manually (`REPLICATE_API_TOKEN`, `DATABASE_URL`, `VITE_AUTH_ENABLED=true`, Stripe keys). Optional: `XAI_API_KEY`, `ACE_STEP_BASE_URL`.
4. Redeploy. Build runs `db:migrate` against Supabase.

Project URL: `https://qrhnoypojhkjkmzlhjfl.supabase.co`

### Note on Neon

A Neon Free project was created earlier while exploring a $0 path. After Hours on this branch is wired for Supabase — do not target the diverged `main` Mashup Pro / Netlify / Neon stack.
