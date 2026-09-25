Yuzuki — Cloudflare language client patch
Base: virtual-companion-current-full-2026-09-24-v0.16.0

Purpose
- Replace Firebase Callable transport for the optional language layer with the deployed Cloudflare Worker.
- Keep Local Brain, memory, personality, emotion, relationship, intimacy, decisions and persistence authoritative and local.
- Send Firebase Auth ID token + Firebase App Check token to the Worker.
- Keep the already-generated local reply on Worker/OpenAI/Auth/App Check/quota/timeout/budget failure.
- Keep the OpenAI API key out of the browser and repository.

Production endpoint
https://shy-unit-ebfb.ermilov-stepa228337.workers.dev/yuzukiSpeak

Changed/new project files
.env.example
README.md
docs/ARCHITECTURE.md
src/ai/cloud-language.ts
src/config/runtime-config.ts
src/storage/firebase.ts
tests/cloud-language.mjs
tests/regression.mjs
cloudflare/worker.js
cloudflare/README.md

Critical persistence contracts intentionally untouched
firestore.rules
firestore.indexes.json
public/runtime-config.js
src/storage/auth.ts
src/storage/live-sync.ts
src/storage/persistence-schema.ts
Firestore paths / revision logic / schema version

Verification completed
- 170 regression checks passed
- 73 Local Dialogue test groups passed
- 120 canonical NLU scenarios passed
- 400-turn stress run passed
- Cloudflare client transport test passed
- AI transport test passed
- cloudflare/worker.js syntax check passed
- Modified TypeScript files parse successfully

Note
A full npm typecheck/build was not run in the isolated build container because dependency installation timed out. The project tests above do not require live cloud calls and all passed.
