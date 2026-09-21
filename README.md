# Virtual Companion v0.5 — audited foundation

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
- World Engine with elapsed-time catch-up instead of a permanent background loop
- Initiative Engine for unfinished topics, own-life stories, check-ins and activity suggestions
- Firebase Authentication + user-scoped Firestore persistence
- Firebase App Check wiring for reCAPTCHA Enterprise/debug mode
- Firebase AI Logic / Gemini adapter
- mobile-first UI with Chat / Together / Look / Room / Settings
- character PNG placeholder at `public/assets/character/avatar-main.png`
- engine trace moved out of the main chat and into Settings

## Important security/data rule

Firestore data is scoped to the signed-in user:

`users/{uid}/characters/{characterId}/...`

Use the included `firestore.rules`. A generic "any authenticated user" rule is intentionally not used.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Add your Firebase Web App config.
3. Add the reCAPTCHA Enterprise site key after App Check registration.
4. For localhost set `VITE_APP_CHECK_DEBUG=true` and register the generated debug token in Firebase Console.
5. Run `npm install`.
6. Run `npm run dev`.

If Firebase variables are empty, the project uses the in-memory repository and local fallback dialogue for engine development.

See `docs/FIREBASE_SETUP.md` for the exact Firebase setup.

## Character image

When the first character PNG is ready, place it here:

`public/assets/character/avatar-main.png`

The main screen will use it automatically. Later versions will replace this single-image slot with the full asset manifest for poses, outfits, expressions and rooms.

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

## Current limitation

The execution environment used to prepare this archive could not complete `npm install` before its network timeout, so a real dependency-backed Vite bundle could not be produced here. Package versions and project code were audited separately; run `npm install && npm run build` on the computer before deployment.

## Next implementation stage

Shared Life Engine: persistent activities, locations, gifts, inventory, shared history and Watch Together. After the generated character assets arrive, Avatar/Asset Engine follows.
