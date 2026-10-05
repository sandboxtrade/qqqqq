# Game2 / Virtual Companion — v0.20.49

Current architecture: GPT-first dialogue + mechanical local state + Firebase persistence/live-sync.

## Runtime ownership

- `cloudflare/worker.js` — GPT dialogue and photo provider routing.
- `src/engine/runtime.ts` — turn orchestration, mechanical clamps, persistence flow.
- `src/character/character-registry.ts` — immutable per-character profile/voice/visual anchors.
- Local runtime remains authoritative for emotion, relationship, intimacy boundaries, world/activity and revisions.
- Firebase handles Auth, Firestore, App Check, persistence and live-sync.

## Dialogue path

`user -> runtime/context -> /yuzukiSpeak -> GPT -> structured reply + bounded deltas + photoDecision -> mechanical clamps -> persistence/live-sync -> UI`

## Photo path

Ordinary / low suggestive:

`gpt-image-2 -> Seedream 4.5 Edit fallback`

Medium / high intimate:

`Seedream 5.0 Lite Edit directly`

Photo intent is mechanically normalized before provider prompting. A recent photo session can inherit framing/outfit/location/pose, while an explicit new modifier overwrites only the requested fields.

WaveSpeed reference policy in v0.20.49:

1. single `avatar.*` reference first;
2. multi-view `identity-sheet.*` only as fallback.

This avoids leaking identity-sheet grid composition into edit-model output.

Scheduled photo jobs are cancellable. Switching character, reset, sign-out or other runtime invalidation aborts pending timers/provider requests.

## Protected contracts

Do not change without a real migration reason:

- Firestore paths/revision contracts;
- `firebase.json` / rules / indexes;
- Auth/App Check/live-sync contracts;
- saved state format;
- `SCHEMA_VERSION = 4`.

## Development

```bash
npm install
npm run verify
```

`cloudflare/worker.js` must be deployed separately whenever it changes.
