Yuzuki v0.17.0 — GPT-first Conversation Architecture
Base: virtual-companion-current-full-2026-09-24-v0.16.0

WHAT CHANGED
- GPT-6 Luna is now the normal conversation generator for every visible user turn.
- Local Brain remains authoritative for durable memory, personality, emotions, relationship, world state, romance/intimacy state, boundaries and locked character positions.
- LocalDialogueRenderer remains the resilient fallback only when Cloudflare/OpenAI/Auth/App Check/budget/timeout fails.
- GPT receives up to 12 recent dialogue lines, selected recovered history, relevant memory/facts/open threads, current world activity, emotion/relationship state and hard local constraints.
- Short elliptical turns are resolved from the real recent conversation instead of relying on local templates.
- GPT output uses Responses API Structured Outputs and returns the visible reply plus small conversation metadata.
- Cloud replies use a dedicated invariant guard: ordinary wording is free, but locked refusals/boundaries/preferences and forbidden internal claims stay protected.
- The Worker no longer skips ordinary simple or high-intimacy dialogue solely because of route type; explicit stay_silent still remains local.
- ENGINE_VERSION/package version -> 0.17.0. Persistence SCHEMA_VERSION stays 4.

INSTALL
1. Copy the archive contents into repository root with replacement.
2. GitHub Pages/app deployment updates the browser/client files.
3. IMPORTANT: Cloudflare is separate. Open `shy-unit-ebfb` -> Edit code, replace Worker code with `cloudflare/worker.js`, then Deploy.
4. Do not change or expose `OPENAI_API_KEY`; it remains a Cloudflare secret.

PRODUCTION ENDPOINT
https://shy-unit-ebfb.ermilov-stepa228337.workers.dev/yuzukiSpeak

PERSISTENCE CONTRACTS NOT CHANGED
- firestore.rules
- firestore.indexes.json
- public/runtime-config.js
- src/storage/auth.ts
- src/storage/live-sync.ts
- src/storage/persistence-schema.ts
- Firestore paths / revision logic / SCHEMA_VERSION=4

VERIFICATION
- npm test: PASS
- 172 regression checks: PASS
- 75 Local Dialogue groups: PASS
- 120 canonical NLU scenarios: PASS
- 400-turn local fallback stress: PASS
- AI transport: PASS
- GPT-first Cloudflare client transport: PASS
- cloudflare/worker.js syntax: PASS

NOTE
No live OpenAI request was made by the automated test suite. The already-deployed production Worker/secret should be smoke-tested after deployment using Network -> yuzukiSpeak -> Response.
