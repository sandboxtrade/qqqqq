Game2 / Yuzuki v0.20.8 — cumulative overlay patch

HOW TO APPLY
1. Extract this ZIP over the ROOT of repository sandboxtrade/qqqqq.
2. Allow replacement of files with the same names.
3. Do NOT delete Firebase configuration or Firestore data.
4. Commit/push to main and let GitHub Actions run Test -> Typecheck -> Build -> Deploy.
5. Separately open Cloudflare Worker shy-unit-ebfb, replace its code with cloudflare/worker.js from this patch and Deploy.
6. Cloudflare Production Secrets must contain OPENAI_API_KEY and WAVESPEED_API_KEY. Never put either key in GitHub/frontend files.

BASE
This patch is cumulative. It is designed to apply directly over the current GitHub main even if you refer to that state as v0.20.3 Photo Safety Fix. The currently readable version metadata in main still says 0.20.2/build-fix, so all required intermediate social/photo/UI changes are included here.

DOES NOT CHANGE
- SCHEMA_VERSION remains 4.
- firebase.json / firestore.rules / firestore.indexes.json are not replaced by this patch.
- Firestore paths/revision format are not changed.
- Existing character chat/memory documents are not deleted.

IMPORTANT
Old sx/static visual assets may still physically exist in src/assets/character/scenes for compatibility/reference, but v0.20.8 runtime does not use the old SX sequence mechanic in the active messenger/photo path.
