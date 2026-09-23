# Initiative Engine v0.5

Initiative is represented as persistent intent, not random unsolicited text.

Supported initial kinds:

- `continue_thread`
- `share_world_event`
- `affectionate_checkin`
- `suggest_activity`
- `share_thought`
- `ask_about_user`

Each initiative contains a reason, priority, timing window, dedupe key and source ids.

## Sources

Initiatives can be created from:

- unresolved Open Threads;
- a meaningful event in her simulated day;
- a sufficiently long conversational pause in an established relationship;
- evening free time suitable for a shared activity;
- high curiosity.

## Selection

The queue is priority-based, but priority must not cause starvation.

Starting in v0.5.9:

- if the highest-priority open thread is already blocked by dedupe, the engine checks the next eligible thread;
- if the newest shareable world event has already been surfaced, the engine checks the next shareable event instead of returning nothing;
- `expired` and `dismissed` initiatives no longer permanently block a dedupe key;
- `surfaced` still blocks the exact same source from being repeated every time the app opens.

## Surfacing

The ready initiative can become one proactive message through runtime maintenance. The local engine selects the intent first. Gemini only renders it naturally; a local renderer is available when Gemini is unavailable.

This stage only hardens the internal queue. It does not redesign proactive-message UI.

## Anti-spam rules

- only one initiative is surfaced at a time;
- source-based dedupe prevents reopening the same already-surfaced event repeatedly;
- check-ins use the last user-interaction timestamp as an episode key;
- a pending absence check-in is dismissed when the user returns;
- initiatives expire;
- expired/dismissed lifecycle states are reusable rather than permanent tombstones;
- initiative reads are bounded to recent records;
- open-thread reads request only the active bounded set;
- language generation is explicitly told not to guilt-trip or imply obligation.
