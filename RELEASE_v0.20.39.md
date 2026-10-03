# v0.20.39 — no-refusal photo continuity hardening

Base: v0.20.38. SCHEMA_VERSION remains 4.

## Fixed
- Photo no-refusal mode no longer depends on repeating exact words like “скинь фото” on every turn.
- Recent sent-photo context now recognizes natural follow-ups: “фотку ещё”, “можно ещё?”, “ещё раз”, “скинь ещё”, “покажи такую же”, “снова”, “другой ракурс”, clothing/pose/framing modifiers, etc.
- A runtime appearance request inside an active photo exchange is mechanically treated as a continued photo request.
- With no-refusal enabled, continued requests are forced to `shouldSendPhoto=true` unless the current turn is explicitly blocked by sleep or a current stop/pause boundary.
- Expanded refusal-text reconciliation catches “неа”, “одной хватит”, “больше не скину”, “не хочу”, “не сегодня” and similar model wording so text cannot contradict a mechanically forced send.
- Previous photo intent (framing, outfit, suggestiveLevel) continues to be inherited unless the new request explicitly changes it.

## Unchanged
- Seedream routing from v0.20.37.
- Firebase/App Check stability fixes from v0.20.38.
- Firestore schema and paths.
