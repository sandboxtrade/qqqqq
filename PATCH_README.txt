Yuzuki v0.19.5 — Transport Reliability hotfix

Problem fixed:
- a normal user turn could wait for two long Cloud/OpenAI attempts;
- after transport/OpenAI failure the runtime saved "Я сейчас что-то туплю, секунду." as if Yuzuki had actually replied;
- repeated failures therefore polluted the visible conversation and recent context.

Changes:
1. One normal cloud attempt per user turn. No automatic second OpenAI retry on transient failures.
2. Auth/App Check 401 refresh is still retried once because that is a credential refresh, not a duplicate model attempt.
3. Token preparation timeout: 4s.
4. Frontend Worker request timeout: 12s.
5. Worker OpenAI timeout: 9.5s.
6. Normal GPT transport failure no longer becomes a fake Yuzuki chat bubble. The user message is marked failed and can be retried; the technical reason is surfaced by the app.
7. Hard local constraints (sleep / intimacy stop / pause) retain their deterministic local response when GPT is unavailable.
8. Engine/package version -> 0.19.5. SCHEMA_VERSION remains 4.

Files:
- src/ai/cloud-language.ts
- src/engine/runtime.ts
- src/config/version.ts
- cloudflare/worker.js
- package.json
- tests/regression.mjs
- tests/cloud-language.mjs

Validation in audit environment:
- 210 regression checks PASS
- 120 canonical NLU scenarios PASS
- 400-turn stress PASS
- AI transport PASS
- Cloud dialogue PASS
- Worker syntax PASS

IMPORTANT:
After replacing cloudflare/worker.js in GitHub, copy the same file into Cloudflare Worker shy-unit-ebfb and Deploy it separately.
No Firebase/Auth/App Check/Firestore contracts, paths, rules, live-sync or character photos are changed by this patch.
