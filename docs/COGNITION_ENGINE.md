# Cognition Engine v0.5.8

The character does not ask Gemini to decide who she is. Personality-sensitive meaning is selected locally before language generation.

## Turn pipeline

1. Local perception preserves literal user text and classifies obvious intent/tone signals.
2. Memory retrieval supplies relevant evidence.
3. Interpretation combines perception, memory, emotion and relationship context.
4. Local thought records a compact internal stance without requesting free-form chain-of-thought from the model.
5. Local decision selects the action.
6. Local content decision selects the personal stance/preference/boundary when Character Core has one.
7. Deterministic state effects update emotion and relationship.
8. Response planner chooses tone, length, memory use, question mode and visual cue.
9. Gemini renders the already selected meaning into natural language.
10. A local response guard rejects outputs that reverse locked decisions or expose internal implementation details.
11. Local fallback is used when a locked generated response is invalid.

## CharacterDecision.content

Every decision carries a content directive:

- `mode`: factual, personal preference, personal stance, support, boundary, refusal, social, activity, clarify or silence;
- `stance`: neutral, agree, disagree, mixed, prefer, avoid, refuse or uncertain;
- `summary`: authoritative semantic instruction;
- `reasons`: why the local engine chose it;
- `locked`: whether Gemini may only rephrase it;
- `provenance`: Character Core/local policy/conversation source;
- optional deterministic fallback and validation keywords.

A locked content decision is not a suggestion. Gemini is a renderer for that meaning.

## Factual vs personality-sensitive content

Ordinary factual questions remain open to Gemini factual language because the local engine is not a world-knowledge database. This does not grant Gemini permission to create new stable character traits.

Personal questions such as preferences, agreement, boundaries and refusal are locally controlled whenever Character Core has enough information. If the core has no established stance, the local decision explicitly represents uncertainty instead of asking Gemini to invent a permanent opinion.

## Character Core participation

The decision layer directly reads:

- immutable traits: curiosity, assertiveness, independence, empathy, playfulness;
- slow traits: openness, patience, confidence;
- values;
- dislikes;
- boundaries;
- structured preference rules;
- communication style.

## Autonomy actions

Reachable local actions include:

`answer`, `ask`, `refuse`, `agree`, `disagree`, `challenge`, `joke`, `change_topic`, `stay_silent`, `initiate_activity`, `show_affection`, `show_irritation`, `set_boundary`, `acknowledge`.

Silence is a real completed turn: the engine persists a silent character event but shows no reply bubble.

## Perception arbitration

Explicit local signals have confidence. If a future Gemini perception layer is enabled again, model classification only overrides intent/tone when it has a meaningful confidence advantage or the local reading is genuinely ambiguous. Literal user text always remains local-authoritative.

## Response guard

`src/dialogue/response-guard.ts` enforces action semantics and length after generation. Locked decisions suppress raw streaming, preventing a contradictory draft from appearing before validation.
