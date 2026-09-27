# v0.20.9 — Per-character daily life + Aiko

## What changed

- Fixed the shared-life symptom where several characters answered that they were working on a project at the same time.
- World routine resolution is now keyed by `characterId`; Yuzuki, Mika, Rin, Lea, Sofia, Eva, Nora and Aiko have different daily rhythms and activity pools.
- Activity detail text is also character-specific, so even the same activity (for example reading) is described differently by different characters.
- `occupied` no longer means “cannot send a photo”. The Cloudflare language/photo instructions now treat normal busyness as compatible with a quick photo when the character wants to send one.
- Intimacy privacy no longer treats an at-home `occupied` state as non-private. Sleep remains blocked and public locations still cap escalation.
- Added Aiko (`aiko_v1`), fictional adult age 25, with a strongly sexually open / provocative default personality, default memory, profile, visual identity description and a more open initial intimacy baseline.
- Added `public/assets/profiles/aiko/` placeholder folder for her future avatar/gallery files.
- Version bumped to `0.20.9`; schema stays `4`.

## Aiko photo references

Until `public/assets/profiles/aiko/avatar.jpg` is added, her profile uses the normal placeholder. OpenAI can still attempt text-only generation from her visual profile; WaveSpeed reference-based fallback requires a real Aiko avatar/reference file.

## Deployment

Apply the patch over v0.20.8, then separately copy/deploy `cloudflare/worker.js` to the `shy-unit-ebfb` Cloudflare Worker. No Firebase schema/rules/index changes are required.

## Verification

- `node --check cloudflare/worker.js` passed.
- TypeScript syntax transpilation passed for all changed TS files.
- `tests/social-architecture.mjs` passed.
- `tests/photo-messages.mjs` passed.
- Custom runtime-independent tests confirmed distinct character routines, Aiko baseline registration and that `occupied` at home no longer blocks intimacy privacy.
- Full `npm test` could not be executed in this container because Firebase/React npm dependencies are not installed locally; the product code itself was not changed to work around that environment limitation.
