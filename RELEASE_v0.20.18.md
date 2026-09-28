# v0.20.18 — Sasha

- Added Sasha, age 20 (`sasha_v1`), as a full character profile.
- Sasha is a college student with a high-energy, current, tech/trend-aware personality without forced youth slang.
- Added a dedicated `SASHA_VOICE_STYLE` so her message rhythm, humor, flirting, punctuation and photo captions stay distinct from Mika/Lea/Aiko.
- Added Sasha-specific world/activity details and an independent daily routine built on the existing world schema.
- Added Sasha-specific photo `expressionGuidance` and canonical identity reference `profile.sasha.avatar`.
- Added `public/assets/profiles/sasha/avatar.jpg` from the user-provided canonical profile photo; this is the source of truth for Sasha's generated appearance.
- Added Cloudflare canonical reference routing for `sasha_v1 -> profile.sasha.avatar` and Sasha-specific no-refusal photo fallback text.
- Added Sasha to social/regression coverage.
- `ENGINE_VERSION=0.20.18`; `SCHEMA_VERSION=4` unchanged.
- Firebase/Auth/Firestore/App Check/live-sync/persistence contracts were not changed.
