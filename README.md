> Актуальная версия: **v0.9.0 — Local Brain**. Начни с `_HANDOFF/V0.9.0_LOCAL_BRAIN.md` и `docs/LOCAL_DIALOGUE_ENGINE.md`.

# Virtual Companion / Yuzuki v0.9.0

Mobile-first virtual character with a persistent local Character Brain, memory, relationship/emotion state, world simulation and Firebase synchronization.

The normal chat path no longer depends on Gemini, OpenRouter, OpenAI, Hugging Face API or another LLM/server. Yuzuki can understand the supported everyday Russian conversation set and render replies entirely inside the browser. Firebase remains the account/persistence/live-sync backend.

## Current architecture

- React + TypeScript + Vite
- Character Core with stable identity/preferences/boundaries
- emotional state with elapsed-time decay
- persistent relationship + romance state
- layered evidence-backed memory and open threads
- existing Character Brain: perception → interpretation → decision → response plan
- Local NLU with intent/concept/topic/sentiment/question/negation/confidence classification
- semantic dialogue acts between Character Brain and language rendering
- `ResponseRenderer` abstraction with `LocalDialogueRenderer` as the current provider
- data-driven Russian language pack (`src/local-dialogue/language/ru/*.json`)
- continuity reconstructed from bounded recent conversation events
- template cooldown + text-similarity anti-repetition
- deterministic seedable response variation; no `Math.random()` in the local engine
- local autonomous-message rendering using the existing Initiative Engine
- Firebase Authentication + user-scoped Firestore persistence
- pending turns + optimistic revision/atomic turn commit
- bounded Firestore live sync across tabs/devices
- Firebase App Check wiring
- existing optional Gemini adapter isolated under `src/ai/`; it is not imported by the normal response runtime
- adult/intimacy foundation remains separate from normal chat

## Normal response path

`USER -> Local NLU -> Character Brain -> semantic CharacterResponsePlan/dialogue acts -> LocalDialogueRenderer -> response guard -> Firestore/event pipeline -> UI/live sync`

A future hybrid mode can add optional LLM polishing after the local semantic/local-language response. The local response remains the fallback and Character Brain does not need to be rewritten.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Add Firebase Web App config if persistent account/sync is needed.
3. Configure App Check/reCAPTCHA Enterprise for production Firebase use.
4. Install dependencies (`npm install`; use `npm ci` when a lockfile is present).
5. Run `npm run dev`.

No Gemini API/model configuration is required for chat.

If Firebase is completely absent in a development build, the project can use its existing in-memory repository for engine work. Production persistence still fails closed when Firebase/App Check configuration is incomplete.

See `docs/FIREBASE_SETUP.md` and `docs/FIREBASE_RUNTIME_CONFIG.md`.

## Dialogue content

- Voice authority: `YUZUKI_VOICE.md`
- Engine documentation: `docs/LOCAL_DIALOGUE_ENGINE.md`
- Russian content: `src/local-dialogue/language/ru/`
- NLU: `src/local-dialogue/nlu/`
- Planner: `src/local-dialogue/planner/`
- Renderer: `src/local-dialogue/renderer/`
- Continuity: `src/local-dialogue/continuity/`
- Repetition protection: `src/local-dialogue/repetition/`

Adding most new dialogue coverage should be a language-data + test change rather than another branch in the engine.

## Tests

`npm test` runs:

1. the existing regression suite for memory/persistence/Character Brain/world/live sync/etc.;
2. Local Dialogue tests, including 100+ canonical NLU scenarios, negation/context/memory/state checks, 20-repeat stress and a 400-turn conversation run;
3. the isolated legacy AI transport test, which verifies the optional adapter but is not part of normal chat runtime.

`npm run verify` additionally runs TypeScript typecheck and the Vite production build when project dependencies are installed.

## Security/data rule

Firestore data remains scoped to the signed-in user:

`users/{uid}/characters/{characterId}/...`

No Firestore path, character/user ID scheme, revision rule or destructive migration was introduced by Local Brain.
