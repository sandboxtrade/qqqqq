Game2 / Virtual Companion v0.20.52 — Diana character patch

Base: v0.20.51
ENGINE_VERSION: 0.20.52
SCHEMA_VERSION: 4

Added character:
- diana_v1 / Диана / age 35
- wealthy-partner + two-children background
- assertive, high-status, sometimes arrogant/bitchy, strongly flirt-initiating personality
- no automatic relationship-status fidelity refusal
- separate voice style, personality, world activity details/routine
- avatar + 3 profile gallery images + identity-sheet fallback

Changed cloudflare/worker.js: YES — redeploy Worker after applying this patch.

Validation:
- npm test: PASS
- 218 regression checks: PASS
- local dialogue 79 groups + 120 NLU + 400-turn stress: PASS
- social architecture/personality diversity/Diana asset checks: PASS
- cloudflare/worker.js node --check: PASS
- typecheck cannot complete in this isolated archive environment because Vite/@vitejs/plugin-react packages are not installed locally.
