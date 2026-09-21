# Memory System v0.2

The memory system is evidence-backed and layered. Raw events are the source of truth and are never replaced by summaries.

## Layers

1. `events` — immutable raw interaction history.
2. `memories` — short-term and episodic recollections derived from events.
3. `knowledge` — semantic facts/inferences about the user with confidence and evidence.
4. `openThreads` — unfinished topics that may be resumed naturally later.
5. `memoryProcessed` — idempotency markers so a raw event is not consolidated twice.

## Memory records

Every memory points to `sourceEventIds`. Low-value short-term memories decay quickly. Important or emotionally weighted episodic memories decay much more slowly. Retrieval reinforces a memory without changing its factual content.

Forgetting means reduced `retrievalStrength` and eventual archival. It does not delete the raw event.

The engine caps active short-term memory at 80 records. Under pressure, the weakest short-term records are archived first.

## Semantic knowledge

Semantic facts have a stable logical `key`, a `value`, a human-readable `statement`, confidence, evidence count, validity timestamps and source event IDs.

When the same fact is repeated, confidence and evidence increase. When a new value conflicts with the same key, the older fact becomes `outdated` and keeps a pointer to the superseding fact. Historical truth is therefore preserved instead of overwritten.

Example:

- old active fact: `user.preference.coffee = like`
- user later says they do not like coffee
- old fact -> `outdated`
- new fact -> `active`, `user.preference.coffee = dislike`

## Open threads

Deferred topics are stored independently from memories. A later message can resolve a matching thread. Russian token normalization is used so inflected forms such as `работу` and `работы` still match.

## Retrieval

Only a small context is sent to the language layer:

- up to 8 memories
- up to 6 semantic facts
- up to 4 open threads

Ranking combines lexical/semantic proxy overlap, importance, confidence, recency, emotional weight and retrieval strength.

## Crash safety / idempotency

Derived objects use deterministic IDs where possible, and each successfully consolidated event receives a `memoryProcessed/{eventId}` marker. On startup the engine scans recent raw events and rebuilds anything that was persisted before an interrupted consolidation.

## Invariants

- Gemini never writes memory directly.
- A summary never replaces its raw source events.
- Contradictions do not silently overwrite history.
- Archived memories remain recoverable from raw history.
- Current-turn text is not fed back as long-term memory in the same response.
