# v0.20.37 — Seedream routing + no-refusal photo continuity

Base: full v0.20.36 archive with App Check 403 diagnostics. `SCHEMA_VERSION=4` remains unchanged.

## Photo routing

- `none` / `low`: OpenAI `gpt-image-2` first; if it does not produce the image, fallback to WaveSpeed `bytedance/seedream-v4.5/edit`.
- `medium` / `high`: direct WaveSpeed `bytedance/seedream-v5.0-lite/edit`.
- MiniMax H3 and WAN 2.6 are removed from the active image path.
- Existing WaveSpeed multi-key failover, credit/auth cooldowns and prediction polling are preserved.

## No-refusal mode

- Direct forms such as `покажи себя` and `сфоткайся` are recognized mechanically.
- Short follow-ups after a recent sent photo (`ещё одну`, `теперь со спины`, `в полный рост`, pose/outfit/framing changes) continue the photo flow instead of falling back to normal chat.
- Follow-ups inherit the last sent photo framing/mood/pose/location/outfit and `suggestiveLevel`; explicit words in the new request override inherited fields.
- With `photoNoRefusalMode=true`, the send decision is mechanical and GPT cannot randomly cancel it.
- Current-turn hard stop/pause/boundary and sleeping state still outrank no-refusal mode.

## Seedream prompt wording

- Seedream prompts explicitly identify the character as an adult woman and include her exact adult age.
- Dynamic visual text is normalized so `girl`, `девушка`, `девочка` wording is not passed into the Seedream image prompt.
- Dialogue/personality text is not rewritten; normalization is limited to the Seedream image prompt builder.

## Preserved from v0.20.36

- Firebase App Check 403 diagnostics and no-force-refresh handling remain intact.
- Firebase/Auth/Firestore/live-sync contracts are unchanged.
