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
