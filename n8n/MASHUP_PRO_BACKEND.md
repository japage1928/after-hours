# Mashup Pro n8n backend

Mashup Pro now treats Netlify as the UI plus a thin same-origin proxy. n8n is the orchestration backend. Provider credentials belong in n8n, not in browser code.

## Netlify -> n8n routing

Set Netlify `N8N_WEBHOOK_BASE_URL` to the common webhook prefix, for example:

`https://YOUR-N8N-HOST/webhook/mashuppro`

The Netlify proxy maps these same-origin routes:

- `/api/orchestrate/song-plan` -> `${N8N_WEBHOOK_BASE_URL}/song-plan`
- `/api/orchestrate/song` -> `${N8N_WEBHOOK_BASE_URL}/song`
- `/api/orchestrate/remix` -> `${N8N_WEBHOOK_BASE_URL}/remix`
- `/api/orchestrate/mashup` -> `${N8N_WEBHOOK_BASE_URL}/mashup`
- `/api/orchestrate/status` -> `${N8N_WEBHOOK_BASE_URL}/status`

Optionally set the same random value in Netlify `N8N_WEBHOOK_SECRET` and validate the incoming `x-mashup-pro-secret` header in every n8n workflow.

## Required response contract

All long-running audio jobs return immediately:

```json
{
  "jobId": "provider-prediction-id",
  "status": "starting"
}
```

Status polling returns:

```json
{
  "jobId": "provider-prediction-id",
  "status": "processing",
  "output": null,
  "error": null
}
```

Completed stem jobs return:

```json
{
  "jobId": "provider-prediction-id",
  "status": "succeeded",
  "output": {
    "vocals": "https://...",
    "drums": "https://...",
    "bass": "https://...",
    "other": "https://...",
    "piano": "https://...",
    "guitar": "https://..."
  },
  "error": null
}
```

Completed song jobs return either one audio URL or an array of audio URLs in `output`.

## Workflow 1: song-plan

Purpose: turn the user's plain-language idea into a strong commercial song blueprint before paying for audio generation.

Recommended chain:

1. Webhook `POST mashuppro/song-plan`
2. Validate secret and input
3. OpenAI producer pass: structure, lyrical concept, hook, BPM/key, genre details, section plan, production notes
4. Optional Grok creative critic: identify generic lines, weak hook, repetitive phrasing, or genre mismatch
5. OpenAI finalizer: return strict JSON matching Mashup Pro's Song schema
6. Respond to Webhook

OpenAI should be the final decision-maker so output stays deterministic and schema-safe. Grok/Gemini are critics, not competing final writers.

## Workflow 2: song

Purpose: submit the finished song blueprint to ACE-Step 1.5 or the selected music generator.

Input:

```json
{
  "prompt": "production prompt",
  "lyrics": "[Verse]...",
  "duration": 120,
  "bpm": 96,
  "keyScale": "A minor"
}
```

Chain:

1. Webhook `POST mashuppro/song`
2. Validate secret and bounds
3. HTTP Request -> Replicate music model create prediction
4. Return `{ jobId, status }` immediately

Do not wait for the whole song in the webhook execution.

## Workflow 3: remix

Purpose: upload one real song and start Demucs separation.

Mashup Pro sends multipart form data with binary field `audio` and text field `operation=stems`.

Chain:

1. Webhook `POST mashuppro/remix`
2. Validate secret/file size/type
3. HTTP Request multipart -> `https://api.replicate.com/v1/files` with binary file mapped to field `content`
4. Read returned `urls.get`
5. HTTP Request -> Replicate Demucs prediction using that file URL
6. Return `{ jobId, status }`

The browser still performs the final Web Audio arrangement after n8n returns clean stems. n8n orchestrates; it does not try to become a DAW.

## Workflow 4: status

Purpose: normalize provider polling for both song generation and stem separation.

Request:

`GET mashuppro/status?id=<predictionId>&type=song|stems`

Chain:

1. Validate secret, id, and type
2. GET Replicate prediction by id
3. Normalize Replicate statuses to `starting|processing|succeeded|failed|canceled`
4. For stem results, normalize output into named stem URLs
5. Respond with the required job contract

## Workflow 5: mashup

Initial implementation can start two stem jobs in parallel using the same Demucs logic as `remix`. Later this endpoint can also run OpenAI producer analysis for key/BPM compatibility, phrase alignment, drop placement, and transition instructions before returning a mix plan.

## Migration behavior

The app is intentionally n8n-first with a temporary legacy fallback. If `N8N_WEBHOOK_BASE_URL` is not configured, the existing direct Netlify -> Replicate path still runs. Once n8n is live and verified, remove `REPLICATE_API_TOKEN` and `XAI_API_KEY` from Netlify and delete the legacy provider edge functions.
