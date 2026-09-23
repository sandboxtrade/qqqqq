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

Timezone-sensitive helpers live in `src/world/time-engine.ts`:

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
