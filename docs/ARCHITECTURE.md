# Architecture v0.5

The local character engine owns identity, state, memory, decisions, world simulation and initiative. Gemini is a fallible perception aid and language renderer, not the source of personality.

Core boundaries:

- `character/` — persistent identity and stable traits.
- `emotions/` — short-lived internal state and decay.
- `relationship/` — persistent relationship state.
- `memory/` — evidence-backed recollection, semantic knowledge, forgetting and retrieval.
- `cognition/` — local perception, interpretation, compact internal state, decision policy and response planning.
- `world/` — elapsed-time simulation, current routine, own-life events and availability.
- `initiative/` — persistent self-generated conversational intentions and deduplication.
- `ai/perception-client.ts` — optional schema-constrained language-model classification.
- `ai/gemini-client.ts` — natural-language rendering after the decision or initiative is already chosen.
- `storage/` — repository abstraction for Firestore/in-memory development.
- `engine/runtime.ts` — orchestration boundary.

Rules:

1. UI does not write personality, memory, emotion, relationship or world state directly.
2. Gemini does not mutate persistent state.
3. Raw events are preserved as source evidence.
4. Derived memory must be reconstructable from raw events.
5. Every long-lived schema change is versioned.
6. Model perception never overwrites literal user text and is locally bounded/validated.
7. Disagreement is not itself a relationship penalty.
8. Character autonomy is decided before text generation.
9. Elapsed time is simulated in bounded chunks; no continuous background loop is required.
10. Own-life events may influence emotion, memory and initiative but cannot rewrite Character Core.
11. Initiative selection is local; Gemini only renders the selected initiative into natural language.
12. Current availability is a decision input, so relationship closeness does not equal permanent availability.
