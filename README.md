> Актуальная версия: **v0.8.0**. Начни с `_HANDOFF/V0.8.0_FINAL_STABILIZATION.md`: завершён финальный аудит всех 30 исходных проблем и стабилизация после этапов 1–6.



# Virtual Companion v0.8.0 — final stabilization

Current release notes and verification limits:
[_HANDOFF/V0.8.0_FINAL_STABILIZATION.md](_HANDOFF/V0.8.0_FINAL_STABILIZATION.md).
Earlier handoffs remain in `_HANDOFF/` as the implementation history.

Private mobile-first virtual character project. This build focuses on a stable long-term character core, memory, cognition, world simulation, Firebase persistence and a usable interface ready for the character PNG assets.

## Current architecture

- React + TypeScript + Vite
- Character Core with stable identity and preferences
- Emotional state with elapsed-time decay
- Relationship state separated from short-term emotions
- Immutable/idempotent raw event log
- Layered memory: short-term, episodic, semantic facts and open threads
- Contradiction handling that keeps historical facts instead of silently rewriting them
- Memory retrieval with relevance, recency, importance, emotional weight and retrieval strength
- Perception → Interpretation → Thought → Decision → Response Plan cognition pipeline
- deterministic character decisions; Gemini renders language but does not own personality/state
- World Engine with elapsed-time catch-up, persisted character timezone and focus/visibility reconciliation
- Initiative Engine for unfinished topics, own-life stories, check-ins and activity suggestions
- Firebase Authentication + user-scoped Firestore persistence
- cursor-paginated conversation history plus bounded Firestore live sync across tabs/devices
- Firebase App Check wiring for reCAPTCHA Enterprise/debug mode
- Firebase AI Logic / Gemini adapter
- mobile-first UI with Chat / Together / Look / Room / Settings
- live-photo character asset at `public/assets/character/avatar-main.jpg`, driven by transient response visual cues plus emotion/world idle state
- engine trace moved out of the main chat and into Settings
- adult/intimacy stage-A architecture is present but deliberately not connected to normal chat yet

## Important security/data rule

Firestore data is scoped to the signed-in user:

`users/{uid}/characters/{characterId}/...`

Use the included `firestore.rules`. A generic "any authenticated user" rule is intentionally not used.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Add your Firebase Web App config.
3. Add the reCAPTCHA Enterprise site key after App Check registration.
4. For localhost set `VITE_APP_CHECK_DEBUG=true` and register the generated debug token in Firebase Console.
5. Run `npm ci`.
6. Run `npm run dev`.

If Firebase is completely absent in a development build, the project may use the in-memory repository for engine work. Production builds fail closed: incomplete/missing Firebase or production App Check configuration never falls back to volatile local persistence.

See `docs/FIREBASE_SETUP.md` for the exact Firebase setup.

## Character image

The current live-photo prototype uses:

`public/assets/character/avatar-main.jpg`

Later versions will replace the single-image prototype with the full layered asset manifest for poses, outfits, expressions and rooms.

## Audit/hardening performed in v0.5

- removed Git metadata and temporary download artifacts from the distributable project
- verified folder hierarchy and import paths
- fixed GitHub Pages relative base path
- added Firebase Auth gating before Firestore reads
- moved Firestore into per-user paths
- added App Check initialization/debug wiring
- restored recent conversation from the event log after reload
- made world-event writes deterministic/idempotent
- aligned in-memory event upsert behavior with Firestore
- fixed emotion mood recomputation after elapsed-time decay
- fixed open-thread matching for inflected Russian topic wording
- fixed memory/open-thread timestamps so recovered historical events retain their original time
- protected bootstrap from React StrictMode double initialization
- added error handling/status UI instead of injecting runtime errors into character dialogue
- added mobile/iPhone-oriented metadata and a redesigned navigation/interface
- strict TypeScript audit with Firebase/React type stubs passes
- executable core smoke test passes

## Current verification note

The v0.8.0 regression suite passes 126/126 with Firebase/Gemini mocked. AI transport passes. All 66 TS/TSX source files pass TypeScript syntax transpilation, and all relative source imports resolve to files in the archive. The final audit re-checked all 30 reported defects and also moved manual conversation pagination to Firestore-side conversation filtering before `limit`, matching the live-sync path. Dependency-backed `npm run typecheck` / Vite production build are not claimed locally because dependency installation could not complete in this environment; global TypeScript stops at missing Vite/React/Firebase typings. GitHub CI/deploy still run locked `npm ci`, tests, typecheck and production build. Live Firebase/Auth/App Check/Gemini/two-device/iPhone verification remains a separate real-cloud smoke test.

## Stabilization status

The 7/7 stabilization cycle is complete and all 30 original findings were re-checked in v0.8.0. Intimacy and Shared Life remain separate product tracks; live-cloud/device smoke testing remains deployment verification rather than another stabilization stage.

## GitHub Pages + Firebase runtime config

GitHub Pages production configuration can be supplied through `public/runtime-config.js`. This avoids repository-level Vite variables for public Firebase client identifiers. See `docs/FIREBASE_RUNTIME_CONFIG.md`.
