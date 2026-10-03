v0.20.37 BUILD FIX

Replace these files preserving paths. This fixes the failed GitHub Actions build caused by a mixed v0.20.35/v0.20.36/v0.20.37 tree.

Files:
- src/ai/cloud-photo.ts
- src/engine/runtime.ts
- src/storage/firebase.ts
- src/app/store.ts
- src/ui/SettingsScreen.tsx
- tests/app-check-guard.mjs

What is fixed:
1. Restores isWaveSpeedBalanceFailureError + CloudPhotoGenerationError contract expected by store.ts.
2. Restores v0.20.36 App Check 403/throttle helpers expected by cloud-photo.ts.
3. Keeps Seedream 4.5 / Seedream 5.0 Lite routing and v0.20.37 photo continuation logic.
4. Keeps the WaveSpeed low-balance UI alert.
5. Adds the app-check-guard test already referenced by package.json.

Do NOT replace cloudflare/worker.js with an older file: the v0.20.37 Seedream worker already in GitHub is the correct one.
