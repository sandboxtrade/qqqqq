# Local Dialogue Engine v0.9.0

The normal conversation path no longer requires Gemini or any other LLM/API. Firebase remains the persistence/auth/sync backend; it is not used for language generation.

## Runtime boundary

`USER -> Local NLU -> existing Character Brain -> CharacterResponsePlan -> LocalDialogueRenderer -> response guard -> existing event/persistence/live-sync path`

The Character Brain still owns emotions, relationship, boundaries, romance, response intent, length, tone and whether Yuzuki should answer. The local dialogue layer owns only language understanding needed by the brain and conversion of the already-decided semantic plan into text.

## Renderer abstraction

`src/local-dialogue/types.ts` defines `ResponseRenderer`:

```ts
export interface ResponseRenderer {
  render(
    plan: CharacterResponsePlan,
    context: DialogueContext,
  ): Promise<RenderedResponse>;
}
```

`LocalDialogueRenderer` is the current implementation. A future `LlmDialogueRenderer` or `HybridDialogueRenderer` can consume the same plan without changing Character Brain.

## Local NLU

Location: `src/local-dialogue/nlu/`.

It uses normalization, tokens/stems, phrase and regex matching, weighted priorities, negative patterns, negation, concepts, topic/sentiment/question classification and recent dialogue context. It returns confidence and never calls a remote model.

Language data lives in `src/local-dialogue/language/ru/`. Each JSON file has `schemaVersion: 1` and is validated at runtime in development.

## Planning

Location: `src/local-dialogue/planner/`.

The planner converts existing `CharacterDecision` + `ResponsePlan` + state/context into semantic dialogue acts such as `CARE`, `ANSWER`, `BOUNDARY`, `FOLLOW_UP`, `REFER_MEMORY` and `SILENCE`. It does not recalculate relationship/emotion state.

## Continuity

Location: `src/local-dialogue/continuity/`.

`DialogueFrame` is reconstructed from bounded recent conversation events. It is not a second persistent source of truth. It resolves short messages such as `А почему?`, `Да`, `Нет`, `А ты?`, `А какие?` and contextual `Не хочу туда`.

## Memory

The renderer consumes the existing `MemoryContext`. It can use active facts/memories passed to it but cannot invent memories. No embeddings or vector database were added. Existing local memory retrieval remains unchanged.

## Anti-repetition

Location: `src/local-dialogue/repetition/`.

The engine uses template cooldowns plus text similarity over unigrams/bigrams/trigrams/prefix/suffix. Exact immediate variant repetition is avoided when alternatives exist. Randomness is seedable and deterministic; the local engine does not use `Math.random()`.

## Fallbacks

The renderer is fail-safe. It attempts specific templates, act composition and then a bounded fallback ladder. Unknown input produces a neutral clarification instead of fabricated understanding. External fact questions use an in-character knowledge limitation rather than hallucinated facts.

## Debugging

Development builds expose the existing runtime trace with NLU and renderer debug data and emit a structured local dialogue trace:

`USER TEXT -> NLU -> CHARACTER PLAN -> SELECTED TEMPLATE/ACTS -> FINAL RESPONSE`

Production does not emit that debug trace.

## Persistence

No Firestore path or core event schema was destructively changed. Character message payloads may include optional `localDialogue` metadata (`templateId`, acts, opening phrase, fallback level) used to rebuild recent repetition context after reload/live sync. Old events without these fields remain valid.

## Optional future LLM

Gemini adapter files are left isolated under `src/ai/` for future optional use, but `engine/runtime.ts` does not import them. A future hybrid path should be:

`Character Brain -> local semantic plan -> LocalDialogueRenderer -> optional LLM polishing -> response guard -> persistence`

If polishing fails, the local response must remain the final response.
