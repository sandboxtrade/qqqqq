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
