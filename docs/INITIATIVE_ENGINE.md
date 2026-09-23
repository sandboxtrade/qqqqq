# Initiative Engine v0.9.0

Initiative is represented as persistent intent, not random unsolicited text.

Supported kinds remain:

- `continue_thread`
- `share_world_event`
- `affectionate_checkin`
- `suggest_activity`
- `share_thought`
- `ask_about_user`

Selection, timing, dedupe, sleep/availability checks and suppression when a real user turn starts remain in the existing Initiative/Runtime layers.

## Surfacing

The ready initiative is converted into an existing semantic decision/response plan by `src/local-dialogue/planner/autonomy-adapter.ts`, then phrased by the same `LocalDialogueRenderer` used for normal conversation.

Gemini is not required. Autonomous logic is not moved into the renderer.

## Anti-spam

Existing initiative lifecycle and dedupe rules remain authoritative. Dialogue-template cooldown/repetition protection is an additional language-level layer and does not replace initiative scheduling.
