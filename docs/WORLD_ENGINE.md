# World Engine v0.4+

The character should appear to have continuity when the app is closed without requiring a server process to run every second.

## Catch-up model

`WorldState.lastSimulatedAt` records the last simulation point. On app bootstrap and before a new user turn:

1. compute elapsed real time
2. clamp expensive catch-up work to a safe maximum window
3. sample a bounded number of time points
4. reconstruct likely routine states
5. generate a small number of deterministic own-life events
6. apply small emotion effects
7. update current activity/location/availability
8. persist compact current world state

The engine never loops over every elapsed minute.

## Routine state

Current routine resolves to:

- `currentActivity`
- `currentLocation`
- `availability`
- `isAwake`
- target energy
- `timeOfDay`

The routine is intentionally generic in v0.4. A later version can give the character a more specific occupation/calendar without changing the orchestration contract.

## Own-life events

Events include quiet reflection, progress on a personal project, a walk, café break, music or a small annoyance. They are deterministic for a given time bucket so tests are repeatable.

Only a six-event rolling summary is kept in `world/current`. Higher-value events are also stored in the immutable event log and can become episodic/short-term memories.

## Interaction with cognition

World state is supplied to the Decision Engine and the Gemini language renderer. The model may mention the world context only when naturally relevant.

An invitation may therefore produce `interested_but_busy` if her current simulated state is occupied, rather than automatic acceptance.
