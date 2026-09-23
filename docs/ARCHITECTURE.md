> Актуальная версия: **v0.7.3**. Начни с `_HANDOFF/V0.7.3_HARDENING_AND_LATENCY.md`: исправления, ускорение без уменьшения retrieval, замеры и ограничения проверки.

> Актуальная версия: **v0.7.2**. Сначала прочитай `_HANDOFF/V0.7.2_AUTOMATIC_VISUALS.md`. Каталог пока содержит одну исходную фотографию.

> Актуальная версия: **v0.7.1**. См. `_HANDOFF/V0.7.1_ROMANTIC_CONTEXT.md`. Ниже сохранена документация базовой v0.7.0.

# Architecture v0.7.0

The local character engine owns identity, state, memory, decisions, world simulation and initiative. Gemini is a fallible perception aid and language renderer, not the source of personality.

Core boundaries:

- `character/` — persistent identity and stable traits.
- `emotions/` — short-lived internal state and decay.
- `relationship/` — persistent relationship state.
- `memory/` — evidence-backed recollection, semantic knowledge, forgetting and retrieval.
- `cognition/` — local perception, interpretation, compact internal state, decision policy and response planning.
- `world/` — elapsed-time simulation, current routine, own-life events and availability.
- `initiative/` — persistent self-generated conversational intentions and deduplication.
- `intimacy/` — adult-only local state/profile foundation. It is isolated from normal chat until the decision engine is implemented.
- `ai/perception-client.ts` — optional schema-constrained language-model classification.
- `ai/gemini-client.ts` — natural-language rendering after the decision or initiative is already chosen.
- `storage/` — repository abstraction, versioned persistence codec and bounded Firestore live-sync adapter.
- `engine/runtime.ts` — orchestration boundary plus cursor-based conversation history access.

Rules:

1. UI does not write personality, memory, emotion, relationship or world state directly.
2. Gemini does not mutate persistent state.
3. Raw events are preserved as source evidence.
4. Derived memory must be reconstructable from raw events.
5. Every long-lived schema change is versioned and decoded through an explicit migration/validation boundary; unchecked Firestore casts are not a persistence strategy.
6. Model perception never overwrites literal user text and is locally bounded/validated.
7. Disagreement is not itself a relationship penalty.
8. Character autonomy is decided before text generation.
9. Elapsed time is simulated in bounded chunks; no continuous background loop is required.
10. Own-life events may influence emotion, memory and initiative but cannot rewrite Character Core.
11. Initiative selection is local; Gemini only renders the selected initiative into natural language.
12. Current availability is a decision input, so relationship closeness does not equal permanent availability.

13. Chat history is paginated from conversation events, not from a fixed raw-event window; world events cannot displace visible messages.
14. Realtime listeners are bounded and advisory; immutable event IDs plus persisted revisions remain the source of truth.

15. Adult/intimacy state is local-engine owned. Gemini must never convert a pause/refusal/stop into permission.
16. Adult mode is disabled by default and v0.7.0 does not auto-create or auto-enter intimacy state during normal bootstrap.
