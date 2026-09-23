# Engine flow v0.6.0

React components never mutate character state directly. `engine/runtime.ts` is the orchestration boundary.

## Startup

`load state/world -> load recent raw events -> simulate elapsed time in memory -> expose runtime state -> idle maintenance later`

Bootstrap is read-only for mutable state so delayed startup work cannot overwrite a newer conversation turn.

## User turn

`load latest runtime revision -> simulate elapsed time -> immutable user event -> memory retrieval -> local perception -> interpretation -> preliminary local decision -> deterministic state effects -> final local action + content decision -> response plan -> Gemini language renderer (unless stay_silent) -> local response guard -> immutable character event -> atomic commit of reply + emotion/relationship + world`

Memory consolidation and initiative maintenance run outside the critical saved-reply path.

## Character Brain boundary

Gemini does not own:
- Character Core;
- personal values/preferences/boundaries;
- action choice;
- locked personal stance;
- emotion/relationship state;
- world state;
- memory writes;
- persistence revision.

Gemini may provide ordinary factual language for unlocked factual answers and natural wording for locked local meaning.

## Silent turn

`stay_silent` persists an empty character message with `silent: true`. It completes the atomic turn but is filtered from visible chat. Bootstrap still sees it as the turn completion marker, so the previous user event is not treated as a failed send.

## World catch-up

`persisted-time floor + character timezone -> bounded elapsed-time sampling -> routine resolution -> own-life event generation -> compact recent-event buffer -> emotion delta -> current location/activity/availability -> foreground reconciliation -> world/current on next atomic turn`

## Memory consolidation

`memoryPending/new-event queue + historical recovery cursor -> raw event -> short-term/episodic memory -> semantic fact extraction (user messages only) -> fact + linked-memory contradiction handling -> open-thread create/resolve -> processor-v2 processed marker`

## Initiative flow

`bounded open threads + recent world events + relationship + elapsed absence + time-of-day + current emotion -> candidate scan with fallthrough -> lifecycle-aware dedupe/expiry -> priority queue -> surfaced initiative -> language renderer`
