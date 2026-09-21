# Cognition Engine v0.3

The character does not ask Gemini to "be the girlfriend". Every turn is split into explicit stages:

1. Local perception parses obvious signals and preserves the literal user text.
2. Optional Gemini perception returns schema-constrained classification only.
3. Local merge treats the model as a fallible observer, not an authority.
4. Interpretation combines perception, relevant memory, emotion and relationship context.
5. Thought state captures a compact private stance without requesting free-form chain-of-thought from the model.
6. Decision chooses an action before language generation.
7. Deterministic state effects update emotion and relationship.
8. Response planner chooses tone, length, memory usage and visual cue.
9. Gemini renders natural language. It cannot mutate state.
10. Local fallback keeps the engine functional when AI is unavailable.

## Autonomy rules

- disagreement is not automatically punished
- requests for validation do not force agreement
- boundaries are respected before conversational continuation
- apologies reduce tension gradually rather than resetting it
- vulnerability is acknowledged without assuming a hidden motive
- uncertain interpretations include an alternative reading

## Gemini structured perception

Firebase AI Logic structured output is used with an explicit response schema. The model only produces classification fields such as intent, tone, vulnerability and ambiguity. Scores are clamped locally, enums are validated, and failures fall back to local perception.
