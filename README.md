# Virtual Companion / Yuzuki v0.9.1

Mobile-first virtual companion with a persistent local Character Brain, local Russian dialogue engine, memory, relationship/emotion state, world simulation and Firebase synchronization.

The normal chat path does not require Gemini or another remote LLM. Firebase remains the authentication, persistence and live-sync backend.

## Current compact structure

```text
src/
├─ ai/                 # optional legacy/future model adapters
├─ app/                # Zustand store + app helpers
├─ avatar/             # visual model + render components
├─ character/          # stable character identity/preferences
├─ cognition/          # Character Brain
├─ config/
├─ core/
├─ dialogue/           # response guard + local fallback
├─ emotions/
├─ engine/             # runtime orchestration
├─ events/
├─ initiative/
├─ intimacy/
├─ local-dialogue/     # NLU, planner, renderer, continuity, anti-repeat
│  └─ language/ru/     # data-driven Russian language pack
├─ memory/
├─ relationship/
├─ storage/            # Firebase/Auth/Firestore/persistence kept separate
├─ ui/                 # flat UI layer
└─ world/
```

The refactor intentionally consolidates tiny files by domain while keeping large or high-risk modules separate. Firebase/Auth/Firestore files were not merged; only imports pointing to consolidated domain modules were updated.

## Runtime flow

`USER -> Local NLU -> Character Brain -> semantic response plan -> LocalDialogueRenderer -> response guard -> event/persistence pipeline -> Firestore/live sync -> UI`

Firebase is storage/auth/sync, not language generation.

## Important files

- Character identity: `src/character/character.ts`
- Character Brain: `src/cognition/local-cognition.ts`
- Local NLU: `src/local-dialogue/nlu.ts`
- Dialogue planning: `src/local-dialogue/planner.ts`
- Rendering: `src/local-dialogue/renderer.ts`
- Continuity: `src/local-dialogue/continuity.ts`
- Anti-repetition/random/debug helpers: `src/local-dialogue/core.ts`
- Memory model: `src/memory/model.ts`
- Memory retrieval: `src/memory/retrieval.ts`
- World simulation: `src/world/world.ts`
- Relationship/romance: `src/relationship/relationship.ts`
- Avatar model: `src/avatar/avatar-model.ts`
- Firebase/Auth/Firestore: `src/storage/`
- Voice/personality authority: `YUZUKI_VOICE.md`

## Firebase

Runtime Firebase configuration remains in `public/runtime-config.js`. Firestore security/index configuration remains in:

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`

The user-scoped storage path remains:

`users/{uid}/characters/{characterId}/...`

No persistence schema version, Firestore path, revision rule, Google Auth provider or App Check policy was intentionally changed by the compact-structure refactor.

See `docs/FIREBASE.md` for setup and schema notes.

## Run locally

1. Copy `.env.example` to `.env.local` if needed.
2. Configure Firebase Web App/App Check for persistent account sync.
3. Install dependencies: `npm install`.
4. Run `npm run dev`.

No Gemini configuration is required for the normal local chat path.

## Verification

Useful checks are under `tests/`:

- `tests/regression.mjs` — memory, persistence, Character Brain, world, romance, avatar, Firestore contracts and live-sync behavior.
- `tests/ai-transport.mjs` — isolated optional Gemini adapter transport contract.
- `tests/local-dialogue.mjs` — Local Dialogue coverage and stress scenarios.

Documentation is consolidated into:

- `docs/ARCHITECTURE.md`
- `docs/LOCAL_ENGINE.md`
- `docs/FIREBASE.md`
- `docs/HISTORY.md`
