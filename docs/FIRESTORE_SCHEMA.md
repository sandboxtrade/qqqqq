# Firestore persistence schema

Persistent companion data is scoped to the authenticated Firebase user:

`users/{uid}/characters/{characterId}`

Collections/documents:

- `state/current`
- `world/current`
- `events/{eventId}`
- `memories/{memoryId}`
- `knowledge/{factId}`
- `knowledgeHeads/{encodedLogicalKey}`
- `openThreads/{threadId}`
- `initiatives/{initiativeId}`
- `memoryProcessed/{eventId}`
- `memoryPending/{eventId}`
- `memoryMeta/recovery`
- `intimacy/state`
- `intimacy/preferences`

## Version domains

There are now three deliberately separate versions:

- Event schema: `SCHEMA_VERSION = 4` in `src/config/version.ts`. It belongs to immutable raw events.
- Persistent derived-document schema: `STORAGE_SCHEMA_VERSION = 2` in `src/storage/persistence-schema.ts`.
- Memory consolidation algorithm: `MEMORY_PROCESSOR_VERSION = 3` in the same file.

These versions must not be treated as interchangeable. A future memory-consolidation algorithm can be bumped without pretending that the Firestore document shape changed, and a storage migration can happen without rewriting immutable historical events.

## Storage codec

Firestore data is no longer accepted through unchecked TypeScript casts. `src/storage/persistence-schema.ts` is the persistence boundary:

`raw Firestore data -> detect version -> migrate supported legacy shape -> validate -> domain object`

New derived documents are validated before write and receive the current `STORAGE_SCHEMA_VERSION` (`2` in v0.6.2).

Pre-v0.5.7 documents did not carry a storage schema version. They are treated as legacy version `0` and migrate through the supported read-time chain to the current storage schema. Reading legacy data does not itself rewrite Firestore; a document is persisted in the current schema only when normal application logic later saves it.

If a document declares a schema version newer than the running application supports, loading fails with a persistence-schema error. The client must not guess how to interpret future data.

Current documents are strict: required fields, enums, numeric ranges and document IDs are validated. This catches corrupt or partially written data before it enters the engine.

## Raw events

`events` remain immutable source evidence. Reusing an existing event ID with different immutable content is an `event-id-collision`.

Older supported event envelopes are normalized in memory to the current event shape for runtime use. Raw historical events are never automatically rewritten during reads. A future event schema newer than `SCHEMA_VERSION` is rejected.

## State and world

From v0.5.6 onward, `state/current` and `world/current` are written atomically with the same monotonically increasing `revision`.

From v0.5.7 onward, both carry a storage `schemaVersion`; the current value is 2. Runtime loads validate both documents before comparing revisions. Legacy documents are accepted only through explicit supported read-time migrations.

A detected state/world revision mismatch still fails with `state-world-conflict` rather than silently choosing one side.

## Memory processing metadata

`memoryProcessed/{eventId}` now contains:

- `eventId`
- `timestamp`
- `schemaVersion`
- `processorVersion`

Legacy markers without a processor version are permanently interpreted as processor version 1. In v0.7.7 the current processor version is 4, so older markers intentionally become eligible for incremental reprocessing. This repairs derived memory/fact state without rewriting immutable raw events.

`memoryPending/{eventId}` is written when a new immutable raw event is first created and removed when that event is successfully consolidated. `memoryMeta/recovery` stores the current processor version plus a `(timestamp, eventId)` historical backfill cursor. This lets recovery cover the complete event history incrementally instead of depending on a fixed recent-event window or rescanning the entire history on every startup.

## Atomic semantic fact heads (v0.7.6)

`knowledgeHeads/{encodedLogicalKey}` is the transaction serialization point for mutually exclusive semantic facts such as `user.residence`. The head stores the current fact ID and confirmation time. Concurrent devices must read and update this document inside the same Firestore transaction before publishing a new active fact. Historical `knowledge/{factId}` documents are preserved with `status=outdated` and `supersededByFactId`.

Server-side memory/fact/thread queries now apply status/type filters and recency ordering before `limit`. Required composite indexes are shipped in `firestore.indexes.json`.

## Security rule

The included rules scope access to the signed-in UID:

```text
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

## Old unscoped path

Event schema v4 also coincided with the earlier move from `characters/{characterId}` to `users/{uid}/characters/{characterId}`. No automatic cross-root migration is performed. Old test data in the unscoped path remains separate.


## World timezone (storage schema v2)

`world/current` now persists `timeZone` as an IANA timezone identifier. Schema-v1 world documents migrate at read time by selecting a valid system timezone; the next normal atomic world commit persists it.

## Conversation history and live sync (v0.6.2)

Visible chat history is read through `listConversationEvents()` using a `(timestamp, eventId)` cursor. Only `message` and `character_action` events become chat rows; raw `world` events remain in the immutable log but do not consume the chat page size.

Realtime sync listens to a bounded recent event window and `state/current`. The listener does not replace persistence rules: events are still deduplicated by immutable event ID, and a newer state revision is reloaded through the repository's paired state/world read before it enters runtime.


## Intimacy foundation (v0.7.0)

The adult module uses two user/character-scoped documents:

- `intimacy/state` — adult-mode flag, neutral phase/status values, bounded internal state, optional neutral scene state, privacy storage policy and optimistic revision.
- `intimacy/preferences` — evidence-backed structured preference records plus an independent optimistic revision.

Both use `STORAGE_SCHEMA_VERSION = 2`; existing document shapes did not change, so no global storage migration was required. Firestore repository writes use transactions and reject stale expected revisions with `intimacy-state-conflict` or `intimacy-preferences-conflict`.

Normal v0.7.0 chat/bootstrap does not read, create or mutate these documents.


## Незавершённые ходы чата

`users/{uid}/characters/{characterId}/turnPending/{messageId}` — служебный marker пользовательской реплики, для которой ещё нет успешно закоммиченного ответа персонажа.

- создаётся атомарно вместе с первым сохранением user message;
- удаляется в той же транзакции, что и успешный `commitTurn`;
- остаётся при сетевой ошибке, abort или state conflict, поэтому сообщение можно восстановить после перезапуска;
- ручной `Пропустить` удаляет только marker, исходный immutable event остаётся в истории и памяти.


## Targeted memory retrieval (v0.7.7)

Normal chat no longer reads the old 450 + 180 memory windows and hundreds of facts/threads on every turn. The common path combines bounded recent/important windows with an optional `topics array-contains-any` memory query and exact semantic fact-key queries. `firestore.indexes.json` includes the required `status + topics + updatedAt` composite index. If that new topic index is temporarily unavailable during deployment, topic lookup degrades to the bounded windows instead of taking the chat offline.
