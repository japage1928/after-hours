# Paste this into the n8n AI Assistant

Build a production-ready workflow named **Mashup Pro Backend**. Do not rebuild unrelated workflows. Use my existing OpenAI credential as the primary producer model. If a Grok credential is available, use it only as an optional creative critic. If a Gemini credential is available, use it only as an optional QA/critic. OpenAI must produce the final schema-safe producer output.

Create these webhook endpoints under one common prefix:

- POST `mashuppro/song-plan`
- POST `mashuppro/song`
- POST `mashuppro/remix`
- POST `mashuppro/mashup`
- GET `mashuppro/status`

Every webhook must optionally validate an incoming header named `x-mashup-pro-secret`. Put the expected secret in one clearly labeled Set/Code node near the start so I can paste the same value used by Netlify `N8N_WEBHOOK_SECRET`. Reject mismatches with HTTP 401.

## song-plan

Input contains: `prompt`, `mode`, `explicit`, `genre`, `vocalistA`, `vocalistB`, `length`, and optional `mashSources`.

Use OpenAI as a music producer/songwriter. Generate an original song blueprint with a strong hook, coherent theme, non-generic lyrics, genre-appropriate phrasing, natural section contrast, sensible BPM/key, and a commercial arrangement. Avoid copying existing lyrics or hooks. If a real artist is mentioned, treat it only as broad stylistic inspiration and do not imitate lyrics or identity.

Optional Grok critic pass: identify weak/generic lines, repetitive ideas, poor hook strength, awkward syllable density, or mismatch to the requested style. Optional Gemini critic pass: check structural consistency and obvious production contradictions. Feed criticism back to OpenAI once. OpenAI returns the final JSON only.

Return this exact shape:

```json
{
  "title": "string",
  "subtitle": "string",
  "bpm": 96,
  "key": "A minor",
  "genre": "string",
  "explicit": true,
  "vocalMode": "rap|sung|hybrid",
  "mood": "string",
  "sections": [
    {
      "id": "verse-1",
      "label": "Verse 1",
      "kind": "intro|verse|chorus|bridge|outro",
      "bars": 8,
      "vocalistId": "string",
      "lyrics": "newline separated lyrics",
      "chords": ["Am","F","C","G"]
    }
  ]
}
```

## song

Input:

```json
{
  "prompt": "production prompt",
  "lyrics": "structured lyrics",
  "duration": 120,
  "bpm": 96,
  "keyScale": "A minor"
}
```

Use an HTTP Request node to create a Replicate prediction for ACE-Step 1.5 or the current selected full-song model. Use a stored Replicate credential, never a token from webhook input. Return immediately after prediction creation using:

```json
{
  "jobId": "prediction id",
  "status": "starting"
}
```

Do not wait for generation to complete in this webhook.

## remix

Accept multipart form data. Binary field is `audio`; text field `operation` will be `stems`.

Validate that an audio file exists. Upload the binary file to Replicate Files using multipart field `content`. Then create a Demucs prediction using the returned file URL. Use model `htdemucs`, MP3 output, 320 kbps, shifts 1, overlap 0.25, clip mode rescale. Return immediately:

```json
{
  "jobId": "prediction id",
  "status": "starting"
}
```

## status

GET query parameters: `id`, `type` where type is `song` or `stems`.

Fetch the Replicate prediction using the stored Replicate credential. Normalize response status to `starting`, `processing`, `succeeded`, `failed`, or `canceled`.

Return:

```json
{
  "jobId": "prediction id",
  "status": "processing",
  "output": null,
  "error": null
}
```

For completed song jobs, `output` must be the final audio URL or array of URLs.

For completed stem jobs, normalize output to:

```json
{
  "vocals": "https://...",
  "drums": "https://...",
  "bass": "https://...",
  "other": "https://...",
  "piano": "https://...",
  "guitar": "https://..."
}
```

Missing optional stems may be omitted, but `vocals` is required.

## mashup

Accept two uploaded audio files. Start Demucs separation for both in parallel using the same Replicate credential. Return a JSON object containing the two prediction IDs. Keep this endpoint modular so a later OpenAI producer-planning step can analyze BPM/key/energy/phrase metadata and return a mix plan.

## Reliability rules

Use explicit error branches. Never expose provider secrets in webhook responses. Keep provider calls in n8n. Return useful upstream status/error messages. Do not hold a webhook open for minutes; create provider jobs and let `/status` handle polling. Name nodes clearly. Keep the workflow inactive until all credentials are attached and test webhooks return valid JSON.
