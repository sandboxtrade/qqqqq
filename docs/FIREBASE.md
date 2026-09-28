# Firebase / Firestore — current production role

Firebase project: `qqqq-91fc0`.

Firebase provides:

- Authentication;
- Firestore persistence;
- App Check;
- per-character live sync / revision-safe storage.

Firebase is not the language model. Normal dialogue is sent from the frontend to Cloudflare Worker `shy-unit-ebfb`, which verifies Firebase Auth + App Check and then calls the language provider.

## Runtime configuration

Public Firebase web client identifiers belong in `public/runtime-config.js`. Provider secrets do not.

Never put these in frontend/runtime-config/GitHub:

- `OPENAI_API_KEY`
- `WAVESPEED_API_KEY`
- `WAVESPEED_API_KEY_2` ... `_10`
- packed `WAVESPEED_API_KEYS`

Those are Cloudflare Production Secrets only.

## Protected persistence contracts

Do not change without an explicit migration:

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `src/storage/firebase.ts`
- `src/storage/auth.ts`
- `src/storage/live-sync.ts`
- existing Firestore paths, schema and revision semantics
- `SCHEMA_VERSION=4`

Character data remains scoped under the signed-in user's per-character paths. The current code keeps personality, memory, state and live-sync ownership local/persistent rather than making Cloudflare/OpenAI the source of truth.

## App Check and Auth

Production Worker endpoints require both:

- Firebase ID token in `Authorization: Bearer ...`;
- App Check token in `X-Firebase-AppCheck`.

The Worker validates them before dialogue/photo requests are processed.
