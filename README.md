# Game2 / Virtual Companion — v0.20.44

Current architecture: GPT-first dialogue + Local-State-first personality/memory/state.

## Runtime ownership

- `cloudflare/worker.js` — Cloudflare backend for GPT dialogue and photo provider routing.
- `src/engine/runtime.ts` — turn orchestration and mechanical state application.
- `src/character/character-registry.ts` — per-character core, personality defaults, voice profiles and visual guidance.
- Local state remains authoritative for personality/memory, emotion, relationship, intimacy/boundaries and world/activity.
- GPT receives that state and writes the natural-language turn; it must not become a second state engine.
- Firebase remains auth/persistence/live-sync infrastructure. It is not the language model.

## Dialogue path

`user message -> runtime state/context -> /yuzukiSpeak -> gpt-6-luna -> structured reply + bounded state deltas + photoDecision -> local mechanical clamps -> persistence/UI`

Normal dialogue is cloud-first. The local fallback is intentionally small and technical rather than a second template-based conversation engine.

## Photo path

Ordinary / low-suggestive:

`gpt-image-2 -> Seedream 4.5 Edit on WaveSpeed if OpenAI does not produce the image`

Medium / high intimate intent:

`Seedream 5.0 Lite Edit on WaveSpeed directly`

WaveSpeed reference policy:

1. `public/assets/profiles/<slug>/identity-sheet.jpg` when available;
2. otherwise `public/assets/profiles/<slug>/avatar.jpg`.

OpenAI ordinary photos use the avatar reference. WaveSpeed jobs are asynchronous and are polled through `/yuzukiPhotoResult`.

## WaveSpeed keys

Secrets live only in Cloudflare Production Secrets:

- `WAVESPEED_API_KEY`
- `WAVESPEED_API_KEY_2` ... `WAVESPEED_API_KEY_10`
- optional packed `WAVESPEED_API_KEYS`

Do not put OpenAI or WaveSpeed secrets in GitHub, frontend code or `public/runtime-config.js`.

## Protected contracts

Do not change without a specific migration reason:

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `public/runtime-config.js`
- `src/storage/firebase.ts`
- `src/storage/auth.ts`
- `src/storage/live-sync.ts`
- Firestore paths/schema/revision
- `SCHEMA_VERSION=4`

## Development

```bash
npm install
npm run verify
```

Deploy frontend changes through the normal GitHub Pages workflow. `cloudflare/worker.js` must be deployed separately to Worker `shy-unit-ebfb` when it changes.
