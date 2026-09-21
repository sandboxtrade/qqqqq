# Initiative Engine v0.4+

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

- unresolved Open Threads
- a meaningful event in her simulated day
- a sufficiently long conversational pause in an established relationship
- evening free time suitable for a shared activity
- high curiosity

## Surfacing

At bootstrap the highest-priority ready initiative may become one proactive message. The local engine selects it first. Gemini only renders it naturally; a local renderer is available when Gemini is unavailable.

## Anti-spam rules

- only one initiative is surfaced at bootstrap
- source-based dedupe prevents reopening the same world event repeatedly
- check-ins use the last user-interaction timestamp as an episode key
- a pending absence check-in is dismissed when the user returns
- initiatives expire
- reads are bounded to 300 recent records
- language generation is explicitly told not to guilt-trip or imply obligation
