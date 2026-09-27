# Game2 / Virtual Companion — v0.20.8

Cumulative social + photo + intimacy hardening patch.

## Important base note
The currently readable GitHub `main` still reports `package.json` / `ENGINE_VERSION` as 0.20.2 and carries the old Worker header, even though the deployed/manual patch history may be referred to as v0.20.3 Photo Safety Fix. This package is intentionally cumulative and replaces every relevant file, so it can be overlaid directly on that current repository state.

## Intimacy architecture
- Adult capability is permanently enabled for every adult character; the UI toggle remains removed.
- Existing persisted `adultModeEnabled: false` values normalize back to `true`.
- `stop`, `pause`, `hesitant`, explicit boundaries and non-adult character gates remain mechanical and cannot be overridden by GPT.
- Strong mutual adult-context flirting can move an already-close interaction into `intimate` without requiring a repeated formal consent phrase every turn.
- Strong explicit mutual consent may advance two phases when relationship, comfort, interest and privacy are already strong.
- Intimate state remains active for up to 90 minutes of inactivity instead of dropping after 45 minutes.
- Home privacy now treats bedroom, living room and kitchen as private-enough locations while still respecting sleep/occupied state.
- Direct arousal language and adult-context turns are detected more reliably.

## Dialogue behavior
- GPT is explicitly told not to become dry, clinical or repeatedly cautious once the state is mutually open and aroused.
- It may use direct adult wording when consistent with Personality and current state.
- Preventive re-checks are not inserted unless the engine reports stop/pause/hesitation/boundary.

## Photo requests
- Requests such as `скинь фотку сзади в нижнем белье` are now recognized both as a photo/appearance request and a strong adult-context flirt signal.
- When the interaction is open and arousal/comfort/interest are high enough, GPT is instructed to send the requested photo instead of inventing an application-level refusal merely because it is suggestive.
- Requested pose/outfit/suggestive level is preserved in Photo Intent rather than neutralized.
- The app still does not bypass provider policy: OpenAI or WaveSpeed may independently reject a particular generation.

## Photo backend fixes
- OpenAI remains primary; WaveSpeed Qwen Image Edit 2511 is fallback.
- Frontend photo timeout increased to 110 seconds so OpenAI failure + WaveSpeed fallback can actually finish.
- WaveSpeed fallback now receives only the current character's resolved reference URLs.
- It never silently substitutes Yuzuki's master reference for Mika/Rin/Lea/Sofia/Eva/Nora.
- Profile avatar references automatically become generator identity references once `public/assets/profiles/<character>/avatar.jpg` exists.

## Social UI carried forward
- Dating/messenger profile layout, galleries and character-specific settings gear.
- Compact Chats / People navigation.
- Seven adult characters with separate IDs/personality/memory/relationship state.
- No 18+ enable/disable control in settings.

## Verification
- `node --check cloudflare/worker.js` passes.
- `npm test` passes in the local mocked test environment: 215 regression checks, 79 local-dialogue groups + 120 canonical NLU scenarios + 400-turn stress run, AI transport, cloud language, social architecture and photo-message checks.
- Changed TS/TSX files pass TypeScript syntax transpilation.
- Relative-import audit reports zero missing local imports.
- A full production `npm run typecheck/build` was not reproduced in this container because the real React/Firebase/Vite packages are not installed here; GitHub Actions will run those gates after upload.

## Deployment
Uploading the patch to GitHub updates the web app, but `cloudflare/worker.js` must also be copied/deployed in Cloudflare separately. Keep `OPENAI_API_KEY` and `WAVESPEED_API_KEY` only as Cloudflare Production Secrets.
