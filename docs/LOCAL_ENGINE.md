# Local Engine

This file consolidates the previously separate project notes. The current source layout is described first; older section headings are retained for technical detail.


---

## Source: COGNITION_ENGINE.md

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

`src/dialogue/dialogue.ts` still enforces action semantics and response length after local rendering. It is a last-resort guard rather than the primary generator.


---

## Source: LOCAL_DIALOGUE_ENGINE.md

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

Location: `src/local-dialogue/nlu.ts`.

It uses normalization, tokens/stems, phrase and regex matching, weighted priorities, negative patterns, negation, concepts, topic/sentiment/question classification and recent dialogue context. It returns confidence and never calls a remote model.

Language data lives in `src/local-dialogue/language/ru/`. Each JSON file has `schemaVersion: 1` and is validated at runtime in development.

## Planning

Location: `src/local-dialogue/planner.ts`.

The planner converts existing `CharacterDecision` + `ResponsePlan` + state/context into semantic dialogue acts such as `CARE`, `ANSWER`, `BOUNDARY`, `FOLLOW_UP`, `REFER_MEMORY` and `SILENCE`. It does not recalculate relationship/emotion state.

## Continuity

Location: `src/local-dialogue/continuity.ts`.

`DialogueFrame` is reconstructed from bounded recent conversation events. It is not a second persistent source of truth. It resolves short messages such as `А почему?`, `Да`, `Нет`, `А ты?`, `А какие?` and contextual `Не хочу туда`.

## Memory

The renderer consumes the existing `MemoryContext`. It can use active facts/memories passed to it but cannot invent memories. No embeddings or vector database were added. Existing local memory retrieval remains unchanged.

## Anti-repetition

Location: `src/local-dialogue/core.ts`.

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


---

## Source: MEMORY_SYSTEM.md

# Memory System v0.3

The memory system is evidence-backed and layered. Raw events are the source of truth and are never replaced by summaries.

## Layers

1. `events` — immutable raw interaction history.
2. `memories` — short-term and episodic recollections derived from events.
3. `knowledge` — semantic facts/inferences about the user with confidence and evidence.
4. `openThreads` — unfinished topics that may be resumed naturally later.
5. `memoryProcessed` — versioned idempotency markers for consolidation/recovery.
6. `memoryPending` — lightweight queue markers for newly written raw events.
7. `memoryMeta/recovery` — processor version and historical backfill cursor.

## Memory records

Every memory points to `sourceEventIds`. Low-value short-term memories decay quickly. Important or emotionally weighted episodic memories decay much more slowly. Retrieval reinforces a memory without changing its factual content.

Forgetting means reduced `retrievalStrength` and eventual archival. It does not delete the raw event.

The engine caps active short-term memory at 80 records. Under pressure, the weakest candidates are archived first.

## Semantic knowledge and contradictions

Semantic facts have a stable logical `key`, a `value`, a human-readable `statement`, confidence, evidence count, validity timestamps and source event/memory IDs.

When the same fact is repeated, confidence and evidence increase. When a new value conflicts with the same key, the older fact becomes `outdated` and keeps a pointer to the superseding fact.

Starting in v0.7.6, contradiction handling is atomic per logical knowledge key and the linked memory evidence is updated as well:

- a `knowledgeHeads/{key}` transaction serializes the active fact across devices;
- a source memory containing only the contradicted fact becomes `outdated`;
- if the same source memory also contains unrelated details, only the contradicted sentence is removed and the remaining memory stays active;
- `validUntil` records when they stopped being current;
- `contradictionGroup` ties the conflict to the semantic key;
- the newer memory may record `supersedesMemoryId`.

This prevents Gemini from receiving an active old memory and an active newer fact at the same time.

## Open threads

Deferred topics are stored independently from memories. A later message can resolve a matching thread. Russian token normalization is used so inflected forms such as `работу` and `работы` still match.

Regular runtime reads request only open threads and use bounded candidate windows.

## Retrieval

Only a small context is sent to the language layer:

- up to 8 memories;
- up to 6 semantic facts;
- up to 4 open threads.

Ranking combines overlap/relevance, importance, confidence, recency, emotional weight and retrieval strength.

v0.7.7 retrieval behavior:

- ordinary queries use a small recent window, a small importance window and a topic-targeted Firestore query;
- known semantic questions such as name/age/residence/work can fetch the exact fact key;
- expanded reads happen only when the targeted pass finds no relevant candidate;
- explicit broad-recall prompts such as `Что ты помнишь?` rank by importance, confidence, retrieval strength and recency without requiring lexical overlap;
- a used memory is reinforced after a successfully committed turn (`accessCount`, `lastAccessedAt`, `retrievalStrength`);
- long messages are compacted from the whole message rather than truncated from the beginning;
- proactive `character_action` events are eligible for durable memory.

## Crash safety / idempotency

Derived objects use deterministic IDs where possible. Each successfully consolidated event receives `memoryProcessed/{eventId}`.

`MEMORY_PROCESSOR_VERSION = 4` in v0.7.7. Older processor markers remain eligible for the incremental rebuild, which adds initiative memories and rebuilds derived summaries without rewriting immutable raw events.

Reprocessing preserves reinforcement metadata such as `retrievalStrength`, `accessCount` and `lastAccessedAt` and does not revive an already archived/outdated memory by accident.

## Incremental recovery

New raw events create `memoryPending/{eventId}` in the same persistence operation that creates the raw event.

Maintenance first processes that pending queue. Historical data is then backfilled with a persisted `(timestamp, eventId)` cursor in `memoryMeta/recovery`.

Therefore recovery no longer means “look at only the most recent N events”, and it also does not require rescanning the full history forever.

## Persistence validation

Memories, knowledge facts, open threads, pending markers and the recovery cursor are decoded through the shared persistence schema codec. Pre-versioned supported data receives safe migration defaults in memory; unsupported future schemas are rejected rather than silently cast.

## Invariants

- Gemini never writes memory directly.
- A summary never replaces its raw source events.
- Contradictions do not silently overwrite history.
- Superseded semantic evidence is not left active in retrieval.
- Archived/outdated memories remain recoverable from raw history.
- Current-turn text is not fed back as long-term memory in the same response.


---

## Source: WORLD_ENGINE.md

# World Engine v0.6.0

The character should keep a coherent life while the app is closed or backgrounded without a server process ticking every second.

## Catch-up model

`WorldState.lastSimulatedAt` records the last simulation point. On bootstrap, before a user turn, and when the app returns to the foreground:

1. resolve an effective monotonic time that never moves behind persisted state;
2. compute elapsed time;
3. clamp expensive catch-up work to a safe maximum window;
4. sample a bounded number of time points;
5. reconstruct likely routine states using the character's persisted timezone;
6. generate a small number of deterministic own-life events;
7. apply elapsed emotion effects;
8. update activity/location/availability in memory.

Foreground reconciliation is intentionally read-only for mutable Firestore state. A later normal turn persists the latest state atomically with the conversation revision. Immutable generated world events can be flushed independently.

The engine never loops over every elapsed minute.

## Character timezone

`WorldState.timeZone` is persisted. Routine resolution never calls browser-local `Date#getHours()`.

Existing schema-v1 world documents are migrated at read time by resolving one valid system timezone. Once a normal world commit occurs, that timezone is stored and later device travel does not silently move the character's daily schedule.

Timezone-sensitive helpers live in `src/world/world.ts`:

- `resolveRoutine(timestamp, timeZone)`
- `resolveTimeOfDay(timestamp, timeZone)`
- `calendarDateKey(timestamp, timeZone)`

## Stable clock

`StableWorldClock` uses wall time normally. If the device clock is moved behind already-persisted world/emotion/relationship timestamps, the clock continues forward from that persisted floor with a monotonic timer for the current session.

This prevents backwards time and long freezes after a backwards clock change. It is a client-side monotonic safeguard, not authoritative server-time synchronization.

## Routine state

Current routine resolves to:

- `currentActivity`
- `currentLocation`
- `availability`
- `isAwake`
- target energy
- `timeOfDay`

The routine is still intentionally generic. A later Shared Life/calendar layer can replace schedule inputs without changing the runtime orchestration contract.

## Availability behavior

Availability is not only display metadata:

- `sleeping`: ordinary low-importance contact may produce `stay_silent`; urgent/vulnerable/high-closeness contact can wake the character for a short sleepy response;
- `occupied`: responses are capped shorter and do not automatically replace the ongoing world activity with `chatting`;
- `free/resting`: an engaged response can move the current activity to `chatting`.

A silent message records user contact but does not magically wake the character.

## Own-life events

Events include quiet reflection, progress on a personal project, a walk, café break, music or a small annoyance. They are deterministic for a given time bucket so tests are repeatable.

Only a six-event rolling summary is kept in `world/current`. Higher-value events are also stored in the immutable event log and can become episodic/short-term memories. Raw world-event payloads include their `emotionalEffect` so historical evidence remains reconstructable.

## Emotion interaction

World simulation moves energy toward routine targets using elapsed-time equations rather than call count. Other world events contribute small emotion deltas.

`mood` is derived by one canonical formula in `emotion-engine.ts`; it is not independently accumulated. Initial state uses the same formula, preventing a first-update discontinuity.


---

## Source: INITIATIVE_ENGINE.md

# Initiative Engine v0.9.0

Initiative is represented as persistent intent, not random unsolicited text.

Supported kinds remain:

- `continue_thread`
- `share_world_event`
- `affectionate_checkin`
- `suggest_activity`
- `share_thought`
- `ask_about_user`

Selection, timing, dedupe, sleep/availability checks and suppression when a real user turn starts remain in the existing Initiative/Runtime layers.

## Surfacing

The ready initiative is converted into an existing semantic decision/response plan by `src/local-dialogue/planner.tsautonomy-adapter.ts`, then phrased by the same `LocalDialogueRenderer` used for normal conversation.

Gemini is not required. Autonomous logic is not moved into the renderer.

## Anti-spam

Existing initiative lifecycle and dedupe rules remain authoritative. Dialogue-template cooldown/repetition protection is an additional language-level layer and does not replace initiative scheduling.


---

## Source: INTIMACY_ARCHITECTURE.md

# Intimacy architecture — foundation v0.7.0

This module is an adult-only extension of the same persistent character. It is not a second chatbot and it is not active in the current conversation runtime yet.

## Non-negotiable invariants

- Yuzuki is fixed as an adult character: `age = 24`, `adult = true` in Character Core.
- Character Core, relationship, emotion, memory and world remain authoritative inputs.
- Gemini never decides whether an intimate interaction is allowed, paused, refused or stopped.
- Past consent never becomes automatic consent for a later interaction.
- A pause/refusal/stop cannot be converted into consent by language generation.
- Neutral technical scene IDs are used in engine/persistence. Graphic scene descriptions do not belong in core logic.
- The adult module stays disabled until `adultModeEnabled` is explicitly enabled by product/UI logic in a later stage.

## Current stage A implementation

Files:

- `src/intimacy/intimacy.ts`
- `src/intimacy/intimacy.ts`
- `src/intimacy/intimacy.ts`
- `src/intimacy/index.ts`

Persistent documents:

- `users/{uid}/characters/{characterId}/intimacy/state`
- `users/{uid}/characters/{characterId}/intimacy/preferences`

Both documents use the normal storage codec and `STORAGE_SCHEMA_VERSION`. They have independent optimistic `revision` fields so two tabs/devices cannot silently overwrite each other.

### IntimacyState

The state currently reserves the following neutral runtime dimensions:

- `adultModeEnabled`
- `phase`: `normal | romantic | close | intimate | high_intimacy | aftercare | paused`
- `interactionStatus`: `inactive | open | hesitant | paused | stopped`
- `comfort`
- `interest`
- `arousal`
- `initiativeDrive`
- optional neutral `activeScene`
- cooldown/boundary timestamps
- `storagePolicy`: `full | memories_only | disabled`

The fields exist now so later engines do not need to retrofit persistence. They do not currently affect chat behavior.

### Neutral scene IDs

Persisted scene IDs must use forms such as:

- `scene.private.close_01`
- `stage.close_01`
- optional pose ID such as `pose.close_01`

The persistence codec rejects non-neutral `sceneId`/`stageId` strings.

### Preferences

`intimacy/preferences` is a versioned evidence document containing structured preferences with:

- stable ID/topic key;
- stance;
- strength/confidence;
- `core` or `learned` origin;
- source event IDs;
- validity timestamps;
- optional supersession link.

This keeps learned preferences evidence-backed instead of letting Gemini invent permanent character traits.

## What is deliberately NOT implemented in stage A

- no automatic entry into intimacy mode;
- no parsing of intimate user intent;
- no intimacy decision/consent state machine;
- no Gemini intimacy prompt;
- no intimacy event generation;
- no memory extraction from intimacy events;
- no intimacy initiative;
- no visual/private-scene resolver;
- no adult-mode UI toggle yet.

Therefore v0.7.0 should behave like v0.6.2 in normal chat.

## Planned next stages

### Stage B — Decision Engine

Add local eligibility/transition decisions using Character Core, relationship, emotion, world privacy/availability, cooldown and current state. The local engine owns allow/hesitate/not-now/boundary/stop and all state transitions.

### Stage C — Memory + relationship integration

Add meaningful intimacy raw events, preference learning/supersession, relationship/emotion effects, aftermath/aftercare and initiative integration. Storage policy must be respected when deciding how much detail to persist.

### Stage D — Visual runtime

Connect neutral scene/pose/clothing state to the future layered asset resolver. The intimacy engine must remain independent of concrete image filenames and graphic descriptions.

### Stage E — End-to-end integration

Normal chat → romantic context → local eligibility → intimate state → completion/aftercare → normal chat, including reload, device conflict, memory continuity and failure recovery.
