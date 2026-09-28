# Release v0.20.29

Base: authoritative full archive v0.20.28. SCHEMA_VERSION remains 4.

## WaveSpeed multi-key failover

- Added server-side WaveSpeed credential pool support in the Cloudflare Worker.
- Recommended secrets are `WAVESPEED_API_KEY`, `WAVESPEED_API_KEY_2`, ... `WAVESPEED_API_KEY_10`.
- Optional convenience secret `WAVESPEED_API_KEYS` may contain additional keys separated by newlines, commas, or semicolons.
- Duplicate keys are removed before use.
- Photo submission automatically tries the next key after credential/quota/rate-limit/server/network failures (`401`, `402`, `403`, `408`, `425`, `429`, `5xx`, timeout/network failure).
- Request/model errors such as `400`/`422` do not cycle through the whole key pool because another credential would not fix the payload.
- `/yuzukiPhotoResult` uses the same pool. During polling, `404` is also treated as credential-specific so a task created under another WaveSpeed account/key can still be found by the Worker.
- A real terminal task result (`failed`, `cancelled`, `timeout`, `deleted`) is not mistaken for a dead API key and does not cause meaningless credential cycling.
- `/health` now reports only the safe configured key count (`waveSpeedKeyCount`) and never exposes any secret value.
- OpenAI-first/MiniMax/WAN routing, character reference policy, Firebase/Auth/Firestore/App Check/live-sync/persistence contracts are unchanged.
