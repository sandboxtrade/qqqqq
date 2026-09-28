# Dialogue Voice — current note

This file is no longer an authority for a local template renderer.

The active sources are:

- global dialogue behavior: `cloudflare/worker.js` -> `INSTRUCTIONS`;
- per-character voice: `src/character/character-registry.ts` -> each character's `voiceProfile.styleGuide`;
- personality/memory/state: runtime context sent by `src/engine/runtime.ts`.

Current rule: voice profiles describe tendencies, not mandatory ticks or canned phrases. The model should normally send one short messenger-style reply, preserve the current topic, avoid assistant/therapy phrasing, and use only a small subset of a character's speech habits on any single turn.

Intimate dialogue remains the same character voice. Intimacy may change directness/content/rhythm but must not switch the character into a generic erotic narrator or erase mechanical stop/pause/boundary state.
