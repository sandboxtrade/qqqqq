# v0.20.15 — Hina

- Added Hina, an adult 20-year-old Japanese character (`hina_v1`).
- Added an independent personality baseline: gentle, shy, warm, easily embarrassed, but with her own will and boundaries.
- Added a separate social profile, character core, initial intimacy baseline and independent persistence namespace through the existing per-character architecture.
- Added Hina-specific world activity details and a distinct daily routine.
- Added canonical photo reference routing: `profile.hina.avatar` -> `public/assets/profiles/hina/avatar.jpg`.
- Added a canonical avatar generation brief at `public/assets/profiles/hina/AVATAR_PROMPT.txt`. The actual approved `avatar.jpg` still needs to be placed there before identity-consistent photo generation is expected.
- Updated Worker character reference routing and regression/social tests.
- SCHEMA_VERSION remains 4; Firebase/Auth/Firestore/App Check/live-sync contracts are unchanged.
