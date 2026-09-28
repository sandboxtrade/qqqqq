# Release v0.20.34

Base: v0.20.33. SCHEMA_VERSION remains 4.

## Deep intimacy + photo + speech consistency audit

- Current-turn stop/pause/boundary now always outranks photoNoRefusalMode for suggestive photo requests.
- Suggestive photo requests no longer mechanically count as a strong flirt and no longer heat/open intimacy state before the character actually reacts. They remain intimacy context only.
- Direct photo intent is reconciled even when local disposition is `choice` and GPT independently chooses to send. This preserves full-body/mirror framing, explicit lingerie/nude intent and prevents ordinary photos from inheriting intimate suggestiveness from state.
- Generic “sexy/seductive photo” no longer auto-escalates to `high` under noRefusalMode; absent a more explicit current-turn request it defaults to `low`.
- Explicit current-turn outfit/suggestive level is canonical whenever a requested photo is actually sent.
- Speech/photo contradictions are removed for any direct request that ends in send, not only noRefusalMode.
- Intimacy mind reflection was simplified from directive prose to short descriptive state text so it does not act like a second hidden dialogue prompt.
- WaveSpeed prompt now receives outward intimacy tone only as a subtle expression/body-language cue and explicitly forbids it from increasing exposure, pose or suggestive level.
- Fixed Cyrillic refusal detection: Russian phrases such as `не буду`, `не могу`, `не отправлю` no longer slip through because of ASCII-style `\b` boundaries.
- OpenAI low-suggestive prompt now receives the same outward intimacy-tone guard as WaveSpeed: expression/body-language only, never exposure or suggestive escalation.
- Added focused `tests/intimacy-photo-speech.mjs`.
- Removed a duplicate `photo-routing-worker.mjs` entry from the npm test command.

Protected Firebase/Auth/Firestore/App Check/live-sync contracts were not changed.
