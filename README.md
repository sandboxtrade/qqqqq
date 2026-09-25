# Yuzuki v0.17.2 — Flirt & Attraction patch

Cumulative patch on top of the GPT-first v0.17 line. It also includes the v0.17.1 memory/emotion/multi-message changes, so applying this archive is enough even if the previous small patch was skipped.

## What changed

- More natural recognition of directed compliments:
  - warm appearance compliments stay affectionate;
  - openly suggestive compliments are classified as stronger flirt signals.
- Flirt-driven arousal is relationship-gated:
  - new/familiar relationship: she can be flattered, shy or playful, but does not become aroused just because the user says something sexual;
  - close/deep + trust/closeness + Adult Mode: strong flirting can raise interest, initiative and arousal noticeably.
- Adult Mode remains a hard local gate. Flirting never turns it on automatically.
- `IntimacyMind` now exposes subtle vs outward arousal to GPT:
  - `inwardArousal` = she is genuinely affected internally;
  - `outwardArousal` = it is strong/safe enough to show more directly in wording.
- GPT receives the current intimacy signal, attraction state, caution, playfulness, pace and preference keys.
- Worker instructions now explicitly distinguish ordinary compliments, suggestive flirting, flustered attraction and arousal.
- Stop / pause / hesitation / boundaries still override any flirt momentum.
- Multi-bubble replies, weighted memory and emotion context from v0.17.1 are preserved.

## Install

1. Copy the contents of this archive over the project repository with file replacement.
2. In Cloudflare open `shy-unit-ebfb` -> Edit code.
3. Replace the Worker code with `cloudflare/worker.js` from this patch.
4. Deploy.
5. Do not change the `OPENAI_API_KEY` secret.

## Important

Arousal only changes when Adult Mode is enabled. This is intentional: the relationship can still flirt while Adult Mode is off, but the explicit intimacy/arousal state remains disabled.

## Verification performed

- 176 regression checks PASS
- 76 Local Dialogue groups PASS
- 120 canonical NLU scenarios PASS
- 400-turn dialogue stress PASS
- Cloud GPT transport PASS
- AI transport PASS
- Cloudflare Worker syntax PASS
- intents JSON parse PASS
- Full TypeScript project typecheck was not available in this isolated environment because Vite packages/type definitions are not installed here.
