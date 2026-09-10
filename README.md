# Mashup Pro

Browser-based DJ edits and stem mixing, deployed at https://mashuppro.netlify.app.

## Current modes

- **DJ blend:** tempo-match and crossfade two full songs. Does not separate vocals.
- **Remix:** a 32-bar edit with synthesized drums, intro, drop and a faded outro.
- **Both:** blend/restyle two complete tracks with new drums.
- **Stems:** combine an already-separated instrumental A with vocals B, with a four-bar instrumental intro and outro. Set original-song BPM and cue points manually; vocal pitch can be adjusted in semitones.

Tempo stretching preserves pitch. The completed render can be replayed or downloaded as 16-bit stereo WAV. Recent mix notes contain metadata only; export audio before leaving the page. Files remain in browser memory and are limited to 20 MB and 10 minutes each.

## Not yet implemented

Automatic separation of ordinary songs, automatic key matching, full-song arrangement, durable audio storage and MP3 encoding. Stems mode requires actual stem files; high-pass filtering is not vocal isolation. The optional xAI request produces a JSON mix plan from metadata, not processed audio. Free-text direction is best effort and applies only to the existing renderer controls.

To support the intended two-song automatic mashup, connect a separate audio inference service (for example Demucs) with private uploads, authenticated asynchronous jobs, completion/error handling and a cost limit. No such service or credential is configured by this change. Do not advertise automatic separation until real-song end-to-end tests pass.

## Development

```sh
npm ci
npm run dev
npm run typecheck
npm run build:dev
node --experimental-strip-types --test scripts/audio-quality.test.mjs
```

Optional `XAI_API_KEY` enables mix planning and the existing Write tab. Mixes use a local plan without it.

SoundTouchJS 0.2.3 provides tempo/pitch processing under LGPL-2.1; its license is included in the installed package and source is available at https://github.com/cutterbl/SoundTouchJS.
