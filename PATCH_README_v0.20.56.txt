Game2 / Virtual Companion v0.20.56

Changed:
- cloudflare/worker.js
- package.json
- package-lock.json
- src/config/version.ts
- tests/photo-prompt-quality.mjs
- tests/intimacy-photo-speech.mjs
- tests/alia-character.mjs
- tests/audit-fixes.mjs

Explicit Qwen photo prompts:
- English only
- shorter and more direct
- internal `topless` is converted to a concrete bare-chest requirement
- internal `nude` is converted to a concrete completely-unclothed requirement
- lingerie is described explicitly as bra + panties
- no Russian personality essay or internal technical metadata is included

Cloudflare Worker changed: deploy it after installing the patch.
SCHEMA_VERSION stays 4.
