# Engine flow v0.5

React components never mutate character state directly. `engine/runtime.ts` is the orchestration boundary.

## Startup

`recover unconsolidated events -> load emotion/relationship snapshot -> load world/current -> simulate elapsed time -> persist own-life events -> apply world emotion effects -> refresh initiative queue -> choose highest-priority ready initiative -> Gemini/local initiative renderer -> proactive message`

Only one initiative can be surfaced during a bootstrap.

## User turn

`simulate elapsed time -> raw user event -> memory retrieval -> local perception -> optional schema-constrained Gemini perception -> guarded perception merge -> subjective interpretation -> preliminary thought/decision using current world availability -> deterministic state effects -> final thought/decision -> response plan -> Gemini language renderer/fallback -> raw character event -> memory consolidation -> mark user interaction in world -> persist snapshots -> refresh future initiatives`

## World catch-up

`lastSimulatedAt -> bounded elapsed-time sampling -> routine resolution -> own-life event generation -> compact recent-event buffer -> emotion delta -> current location/activity/availability -> world/current`

World events with sufficient importance are also written to the raw event log and may become memories.

## Memory consolidation

`raw event -> short-term/episodic memory -> semantic fact extraction (user messages only) -> contradiction handling -> open-thread create/resolve -> processed marker`

## Initiative flow

`open threads + recent world events + relationship + elapsed absence + time-of-day + current emotion -> initiative candidates -> dedupe/expiry -> priority queue -> one surfaced initiative -> language renderer`

Important boundary: Gemini can contribute classification and language, but it cannot write emotion, relationship, memory, world state, initiative state, Character Core or decisions.
