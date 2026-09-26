# Architecture

This file consolidates the previously separate project notes. The current source layout is described first; older section headings are retained for technical detail.


---

## Source: ARCHITECTURE.md

# Architecture v0.9.0

The local character engine owns identity, state, memory, decisions, world simulation and initiative. Normal dialogue is now fully functional without an LLM.

Core boundaries:

- `character/` — persistent identity and stable traits.
- `emotions/` — short-lived internal state and decay.
- `relationship/` — persistent relationship/romance state.
- `memory/` — evidence-backed recollection, semantic knowledge, forgetting and retrieval.
- `cognition/` — existing Character Brain: interpretation, decision policy and response planning.
- `local-dialogue/nlu/` — small local language understanding layer.
- `local-dialogue/planner/` — semantic dialogue acts/renderer plan adapter.
- `local-dialogue/renderer/` — `ResponseRenderer` implementation, slots, template/fragment composition and post-processing.
- `local-dialogue/continuity/` — bounded recent-topic/reference resolution.
- `local-dialogue/repetition/` — cooldown and text-similarity protection.
- `local-dialogue/language/ru/` — versioned conversation data packs.
- `world/` — elapsed-time simulation, routine and own-life events.
- `initiative/` — persistent self-generated intentions and deduplication.
- `intimacy/` — adult-only local state/profile foundation, still separate from normal chat.
- `ai/` — isolated optional legacy/future model adapters; not imported by the normal runtime response path.
- `storage/` — repository abstraction, persistence codec and bounded Firestore live sync.
- `engine/runtime.ts` — orchestration boundary and atomic turn integration.

Rules:

1. UI does not write personality, memory, emotion, relationship or world state directly.
2. Firebase is storage/auth/sync, not language generation.
3. Local Dialogue Renderer does not decide emotions, relationship level, romance or boundaries.
4. Raw events remain source evidence; derived memory remains reconstructable.
5. Long-lived schemas remain versioned and backward-compatible.
6. DialogueFrame is reconstructed from bounded recent events rather than persisted as a second source of truth.
7. Memory claims require supplied memory/fact evidence.
8. Initiative selection remains local and precedes text rendering.
9. The local engine uses deterministic seedable variability; primary decisions are never random.
10. Gemini/other LLM failures cannot prevent a normal reply because no model is required in the response path.
11. Optional future LLM polishing must consume an already-created local semantic/local-language response and fall back to it on failure.
12. Firestore paths, revision rules, pending turns and live-sync remain authoritative and unchanged.


---

## Source: PROJECT_STRUCTURE.md

# Project structure

This archive intentionally contains normal folders. It contains no `.git` directory, no Git object files, no `node_modules`, no build output and no temporary download files.

Main layout:

```text
virtual-companion-v0.7.0/
├─ docs/
├─ public/
│  └─ assets/
│     ├─ character/
│     ├─ items/
│     ├─ locations/
│     ├─ private-scenes/
│     └─ rooms/
├─ src/
│  ├─ ai/
│  ├─ app/  # Zustand store + message-sync merge helpers
│  ├─ avatar/
│  ├─ character/
│  ├─ cognition/
│  ├─ config/
│  ├─ debug/
│  ├─ dialogue/
│  ├─ emotions/
│  ├─ engine/
│  ├─ events/
│  ├─ gifts/
│  ├─ initiative/
│  ├─ intimacy/
│  ├─ memory/
│  ├─ relationship/
│  ├─ shared-life/
│  ├─ storage/
│  │  ├─ persistence-schema.ts
│  │  ├─ live-sync.ts
│  │  └─ repositories/
│  ├─ ui/
│  │  ├─ components/
│  │  └─ screens/
│  ├─ watch/
│  └─ world/
├─ .env.example
├─ .gitignore
├─ firestore.rules
├─ index.html
├─ package.json
├─ README.md
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts
```

When copying to a locally cloned GitHub repository, copy the contents of the extracted `virtual-companion-v0.7.0` folder into the repository root. The folder hierarchy must remain unchanged.


## Current avatar bridge (v0.7.0)

- `src/avatar/LivePhoto.tsx` — temporary single-photo WebGL renderer.
- `src/avatar/avatar-model.ts` — read-only mapping from response `visualCue` + current emotion/world into render parameters.
- `src/ui/components/CharacterStage.tsx` — owns the transient cue lifetime and falls back to the current runtime state.

This is intentionally not the future layered pose/outfit/room system.


---

## Source: ENGINE_FLOW.md

# Engine flow v0.9.0

React components do not mutate character state directly. `engine/runtime.ts` remains the orchestration boundary.

## Startup

`load state/world -> load recent raw events -> simulate elapsed time in memory -> expose runtime state -> idle maintenance later`

Bootstrap is read-only for mutable state so delayed startup work cannot overwrite a newer conversation turn.

## User turn

`load latest runtime revision -> simulate elapsed time -> immutable user event/pending marker -> existing memory retrieval -> Local NLU -> existing Character Brain interpretation/decision -> deterministic emotion + relationship effects -> final CharacterDecision + ResponsePlan -> romance/appearance plan -> Local Dialogue Renderer -> response guard -> immutable character event -> atomic commit of reply + state + world -> live sync/UI`

Memory consolidation and initiative maintenance remain outside the critical saved-reply path.

## Character Brain boundary

Character Brain owns:

- Character Core identity/preferences/boundaries;
- action choice and locked semantic stance;
- emotion and relationship state;
- romance/boundary decisions;
- world state and availability;
- response length/tone/question intent;
- memory references supplied by the existing memory layer.

The renderer only converts that semantic decision into language.

## Local dialogue boundary

`Local NLU -> CharacterResponsePlan/dialogue acts -> data-driven template/fragment selection -> slots -> repetition penalty/cooldown -> post-processing`

No remote model is required. Gemini/OpenRouter/OpenAI/Hugging Face APIs are absent from the normal response path.

## Silent turn

`stay_silent` persists an empty character message with `silent: true`. It completes the atomic turn but is filtered from visible chat.

## World catch-up

`persisted-time floor + character timezone -> bounded elapsed-time sampling -> routine resolution -> own-life event generation -> compact recent-event buffer -> emotion delta -> current location/activity/availability -> foreground reconciliation -> world/current on next atomic turn`

## Memory consolidation

`memoryPending/new-event queue + historical recovery cursor -> raw event -> short-term/episodic memory -> semantic fact extraction -> contradiction handling -> open-thread create/resolve -> processed marker`

## Initiative flow

`bounded open threads + recent world events + relationship + elapsed absence + time-of-day + current emotion -> local initiative selection -> Local Dialogue Renderer -> character_action event -> existing Firebase/live-sync path`

Autonomous decision logic remains in the Initiative/Character Brain layers; the renderer only phrases the selected initiative.
