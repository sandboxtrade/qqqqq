YUZUKI / GAME2 — v0.20.9 PATCH

BASE:
  Apply directly over v0.20.8.

MAIN FIXES:
  1. Per-character daily routines instead of one shared "project" routine.
  2. Character-specific activity detail wording.
  3. Being busy no longer automatically means "cannot send a photo".
  4. At-home occupied state no longer mechanically removes intimacy privacy.
  5. New adult character Aiko, 25, with a very bold/flirtatious baseline personality.
  6. Aiko starts with a more open intimacy baseline, while stop/pause/boundaries remain absolute.

IMPORTANT:
  After uploading the patch to GitHub, deploy cloudflare/worker.js separately in Cloudflare.
  Do not put OPENAI_API_KEY or WAVESPEED_API_KEY in GitHub/runtime-config.

AIKO PHOTOS:
  Add her canonical reference as:
    public/assets/profiles/aiko/avatar.jpg
  Optional gallery:
    public/assets/profiles/aiko/01.jpg
    public/assets/profiles/aiko/02.jpg
    public/assets/profiles/aiko/03.jpg

NO FIREBASE MIGRATION REQUIRED.
SCHEMA_VERSION remains 4.
