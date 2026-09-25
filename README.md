# Virtual Companion / Yuzuki v0.16.0

Mobile-first virtual companion with a persistent local Character Brain, local Russian dialogue engine, memory, relationship/emotion state, world simulation and Firebase synchronization.

The normal chat path remains fully functional without a remote LLM. Firebase remains the authentication, persistence and live-sync backend; eligible turns can optionally use an authenticated Cloudflare Worker as a stateless OpenAI wording layer after the Local Brain has already produced a complete reply.

## Current compact structure

```text
src/
├─ ai/                 # optional Cloudflare wording transport + legacy adapters
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

`USER -> Local NLU -> Character Brain -> InternalThought/Mind Continuity -> semantic response plan -> LocalDialogueRenderer -> local guard -> optional Cloudflare/OpenAI wording pass -> local guard -> event/persistence pipeline -> Firestore/live sync -> UI`

Firebase is storage/auth/sync, not language generation. The optional cloud wording layer lives behind `cloudflare/worker.js`; the OpenAI key never belongs in the browser client.

## Mind Continuity v1

Yuzuki can now keep selected self-generated views as ordinary `character` knowledge facts, reuse them in later conversations, accumulate counter-evidence, revise them gradually instead of rerolling an opinion every turn, and occasionally return to a durable thought through the existing initiative queue. The implementation reuses the current event/knowledge/persistence pipeline and does not add Firestore paths or a new persistence document schema.

## Living Intimacy + Russian Voice v1

Adult intimacy now participates in the same local cognition path as the rest of Yuzuki instead of acting as a detached response mode. When Adult Mode is enabled and the current context is relevant, the brain derives tenderness, desire, caution, playfulness, confidence, pace and conflict; these signals influence `InternalThought`, dialogue planning and spontaneous reactions. Stable and learned intimacy preferences reuse the existing versioned `intimacy/preferences` document and optimistic revision contract. Learned preferences become confident gradually from repeated evidence. Current-turn boundaries, pause/stop priority, privacy gates and the separation between internal `horny` and outward `hornys` remain intact.

The Russian language layer also has broader high-frequency variation for acknowledgements, disagreement, care, questions, humor, emotional reactions, flirt/affection, check-ins and aftercare. Contextual intimacy continuity can now understand fresh short cues such as approval or hesitation without treating the same wording as consent in an unrelated conversation.

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
- Optional cloud language client: `src/ai/cloud-language.ts`
- Cloudflare Worker source: `cloudflare/worker.js`
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

No Gemini/OpenAI configuration is required for the local fallback path. Production cloud wording additionally requires the deployed Cloudflare Worker and its server-side `OPENAI_API_KEY` secret.

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
