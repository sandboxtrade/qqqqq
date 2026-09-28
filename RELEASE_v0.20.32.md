# Release v0.20.32 — audit / dialogue naturalness / photo routing cleanup

Base: v0.20.30 + v0.20.31 WaveSpeed credit-failover patch. SCHEMA_VERSION remains 4.

## Dialogue
- Reworked the global GPT prompt to reduce assistant/therapy cadence, mini-essays, forced questions, canned markers and repeated voice tics.
- Voice profiles are now explicitly probabilistic tendencies rather than mandatory checklists.
- Softened forced multi-bubble behavior for energetic/shy profiles; one natural message is the default unless a second beat is genuinely separate.
- Intimate dialogue keeps the same character voice, does not switch into a generic erotic narrator, does not auto-escalate intensity, and still obeys current-turn stop/pause/hesitation/boundary state.
- Removed character-specific canned photo fallback lines. GPT caption is preferred; the last technical fallback is deliberately minimal.

## Photo prompts / routing
- Rechecked the complete active chain: ordinary/low -> OpenAI -> MiniMax H3 -> WAN 2.6; medium/high -> WAN 2.6 directly.
- Fixed ordinary direct-photo framing patch loss (e.g. full-body / mirror request no longer relies on GPT inferring the framing twice).
- Expanded visible-emotion propagation so annoyed/sad/jealous/hurt/anxious/tender/curious etc. are not silently flattened to neutral.
- OpenAI ordinary/retry prompts now use references for identity only and preserve requested mood/expression instead of forcing neutral poses.
- Reworked WAN private/intimate image direction toward believable personal smartphone composition, character-specific expression and realistic asymmetry/light; identity sheet is identity-only and must not drive pose/layout.
- Removed obsolete OpenAI casual-minimal prompt and obsolete scene-reference resolver code from Worker.

## WaveSpeed robustness
- Account credit/auth failures get a short process-local credential cooldown, so new generations do not immediately retry a known dead key in the same Worker isolate.
- Result polling still checks all configured keys so existing tasks remain retrievable.
- Terminal WaveSpeed detail parsing now recognizes nested error/message/failure_reason forms.

## Contract fixes
- Added missing `photoPolicy` field to `CloudLanguageInput`; runtime was already sending it and Worker was already consuming it.
- Cleaned stale photo diagnostic mode left over from the removed third OpenAI retry.

## Documentation
- Replaced stale v0.9/v0.17 architecture claims in README / architecture / local-engine / voice docs with the active GPT-first v0.20.32 architecture.
- Updated `.env.example`: provider secrets remain Cloudflare-only; optional frontend config contains only the Worker endpoint.

## Preserved
- Firebase/Auth/Firestore/App Check/live-sync persistence contracts unchanged.
- Protected Firebase files unchanged.
- API keys remain server-side only.
- SCHEMA_VERSION=4.
