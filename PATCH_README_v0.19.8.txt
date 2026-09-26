Yuzuki v0.19.8 — Intimacy Dynamics + Visual State

Base: current v0.19.7
SCHEMA_VERSION remains 4.

What changed
- Adult intimate dialogue no longer has an app-level instruction to hide direct adult wording behind vague euphemisms.
- Ongoing mutually-open intimacy no longer forces a repetitive consent check on every single reply.
- Stop / pause / hesitant / boundary and Adult Mode remain hard mechanical constraints.
- GPT now returns bounded intimacyReaction deltas: comfort, interest, arousal, initiativeDrive.
- GPT cannot use those deltas to change consent, phase, interaction status, or bypass a hard boundary.
- Artificial relationship thresholds around arousal/intimacy were relaxed; explicit current-turn consent is still required for mature phase escalation.
- The default gradual preference no longer forces virtually every intimate response into slow mode.
- flirty / horny / hornys visual states now follow Yuzuki's own generated reply much more directly.
- Ordinary visual tone was expanded so amused, bashful, shy, surprised, confused, thinking, focused, skeptical, bored, comfortable, annoyed, sleepy, jealous, welcoming etc. can directly affect the portrait.
- Ordinary portrait switching hysteresis was reduced.
- AssetScene no longer blocks scene switching while waiting for large PNG decode().
- Nearby likely portrait assets are warmed in the browser cache.
- Intimacy assets and next SX frame continue to preload.
- ENGINE_VERSION/package version -> 0.19.8.

Files in this patch
package.json
src/config/version.ts
src/ai/cloud-language.ts
src/avatar/avatar-model.ts
src/avatar/AssetScene.tsx
src/engine/runtime.ts
src/intimacy/intimacy.ts
cloudflare/worker.js
tests/regression.mjs

Not included / not touched
- src/assets/character/scenes/
- Firebase config/rules/indexes
- auth/live-sync/revision contracts
- persistence schema

Deployment
1. Replace the files above in GitHub.
2. Wait for GitHub Actions test -> typecheck -> build.
3. Copy cloudflare/worker.js to Worker shy-unit-ebfb and Deploy.

Local verification performed
- cloudflare/worker.js: node --check PASS.
- changed TS/TSX files: TypeScript noResolve parse/type pass aside from expected unresolved external/project imports in the isolated check.
- tests/regression.mjs syntax PASS.
- Full npm build was not run locally because node_modules are not present in this environment.
