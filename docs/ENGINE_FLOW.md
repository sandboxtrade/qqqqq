# Engine flow v0.9.0

React components do not mutate character state directly. `engine/runtime.ts` remains the orchestration boundary.

## Startup

`load state/world -> load recent raw events -> simulate elapsed time in memory -> expose runtime state -> idle maintenance later`

Bootstrap is read-only for mutable state so delayed startup work cannot overwrite a newer conversation turn.

## User turn

`load latest runtime revision -> simulate elapsed time -> immutable user event/pending marker -> existing memory retrieval -> Local NLU -> existing Character Brain interpretation/decision -> deterministic emotion + relationship effects -> final CharacterDecision + ResponsePlan -> romance/appearance plan -> Local Dialogue Renderer -> response guard -> immutable character event -> atomic commit of reply + state + world -> live sync/UI`

Memory consolidation and initiative maintenance remain outside the critical saved-reply path.

## Character Brain boundary

Character Brain owns:

- Character Core identity/preferences/boundaries;
- action choice and locked semantic stance;
- emotion and relationship state;
- romance/boundary decisions;
- world state and availability;
- response length/tone/question intent;
- memory references supplied by the existing memory layer.

The renderer only converts that semantic decision into language.

## Local dialogue boundary

`Local NLU -> CharacterResponsePlan/dialogue acts -> data-driven template/fragment selection -> slots -> repetition penalty/cooldown -> post-processing`

No remote model is required. Gemini/OpenRouter/OpenAI/Hugging Face APIs are absent from the normal response path.

## Silent turn

`stay_silent` persists an empty character message with `silent: true`. It completes the atomic turn but is filtered from visible chat.

## World catch-up

`persisted-time floor + character timezone -> bounded elapsed-time sampling -> routine resolution -> own-life event generation -> compact recent-event buffer -> emotion delta -> current location/activity/availability -> foreground reconciliation -> world/current on next atomic turn`

## Memory consolidation

`memoryPending/new-event queue + historical recovery cursor -> raw event -> short-term/episodic memory -> semantic fact extraction -> contradiction handling -> open-thread create/resolve -> processed marker`

## Initiative flow

`bounded open threads + recent world events + relationship + elapsed absence + time-of-day + current emotion -> local initiative selection -> Local Dialogue Renderer -> character_action event -> existing Firebase/live-sync path`

Autonomous decision logic remains in the Initiative/Character Brain layers; the renderer only phrases the selected initiative.
