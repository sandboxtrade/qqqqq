# Cognition Engine v0.9.0

The existing Character Brain remains authoritative. The v0.9.0 local dialogue work does not move personality, emotion or relationship decisions into the renderer.

## Turn pipeline

1. Local NLU extracts intent, concepts, topic, sentiment, question type, entities, negation and confidence.
2. Existing local perception remains the Character Brain input and is conservatively enriched by Local NLU.
3. Existing memory retrieval supplies evidence.
4. Interpretation combines perception, memory, emotion and relationship context.
5. Character Brain selects action and content stance.
6. Deterministic state effects update emotion and relationship.
7. Character Brain produces final `CharacterDecision` and `ResponsePlan`.
8. Romance/appearance logic remains local and authoritative.
9. Dialogue planner maps the decision into semantic dialogue acts.
10. `LocalDialogueRenderer` phrases that plan from versioned Russian data.
11. The existing response guard remains a final semantic safety boundary.
12. Existing atomic persistence commits reply + state + world.

## CharacterDecision.content

Locked meaning remains authoritative. The renderer may vary phrasing but must not reverse a refusal, boundary, preference or other locally selected stance.

## Factual questions

The local dialogue engine is deliberately not a world-knowledge database. When no local source exists, Yuzuki admits that she does not know rather than fabricating an answer.

## Perception arbitration

Local NLU does not replace the existing Character Brain. It supplies a richer deterministic classification that is adapted into the existing `Perception` contract. The old optional model-perception adapter remains isolated for possible future experiments but is not invoked by the current runtime.

## Response guard

`src/dialogue/response-guard.ts` still enforces action semantics and response length after local rendering. It is a last-resort guard rather than the primary generator.
