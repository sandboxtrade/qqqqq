# v0.20.49 — large audit fix

## Fixed

- cancellable deferred photo jobs; reset/switch/sign-out abort pending timers and provider requests;
- broader direct-photo grammar and unified continuation detection through `derivePhotoIntentPatch()`;
- auth-change inbox/privacy reset;
- resilient inbox refresh: a transient per-character Firestore error no longer removes a known chat;
- visible WaveSpeed balance alert;
- idempotent failed-photo retry using deterministic photo event/local-cache identity;
- generated/proactive photo/message preview updates no longer depend entirely on live-sync;
- Seedream reference strategy changed to avatar-first with identity-sheet fallback;
- WaveSpeed prompt reduced and deduplicated;
- stale `.tsbuildinfo` artifacts removed;
- current README/architecture/handoff docs updated to v0.20.49.

## Preserved

- `SCHEMA_VERSION = 4`;
- Firestore paths and revision contracts;
- App Check/live-sync behavior;
- 25s Worker OpenAI timeout / ~40s client Worker timeout;
- existing provider routing (OpenAI -> Seedream 4.5 fallback, medium/high -> Seedream 5 Lite).

## Verification note

`npm test` passes fully on the release source. `cloudflare/worker.js` passes `node --check` and the local benchmark passes.

A lockfile is intentionally not fabricated. The supplied source archive inherited no `package-lock.json`, and this isolated build environment cannot reach the npm registry to resolve and generate a trustworthy lockfile. Run `npm install` once in a networked development environment to create the lockfile, then commit it if reproducible `npm ci` installs are required.
