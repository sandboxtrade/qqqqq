# Current Architecture — v0.20.37

This file describes the active runtime, not historical implementations.

## Core principle

Dialogue is GPT-first. Durable and mechanical character state is local-state-first.

Local state is the source of truth for:

- character/personality;
- editable long-term memory;
- current emotions;
- relationship state;
- intimacy state and hard boundaries;
- world/activity/sleep/availability;
- persistence and revision rules.

GPT is responsible for natural language and bounded per-turn reaction suggestions. It does not own canonical state.

## User-turn flow

1. `src/engine/runtime.ts` loads/simulates current mechanical state.
2. Runtime builds `CloudLanguageInput`: current character, personality, voice profile, memory, recent conversation, world, emotion, relationship, intimacy and constraints.
3. `src/ai/cloud-language.ts` sends it to `/yuzukiSpeak` with Firebase Auth + App Check.
4. `cloudflare/worker.js` sanitizes the packet and calls `gpt-6-luna` with the structured response schema.
5. Worker returns natural-language message(s), bounded reaction deltas and optional `photoDecision`.
6. Runtime mechanically clamps/applies reactions; hard stop/pause/sleep constraints remain authoritative.
7. Reply/state/events are persisted through the existing repository/live-sync path.

The old local NLU/planner/renderer stack is not imported from the production entry graph. It remains only as legacy/test code until deliberately removed together with its legacy regression tests.

## Memory

The active dialogue path receives:

- editable/canonical long-term memory;
- up to the recent conversation window supplied by runtime;
- current message separately.

Legacy semantic retrieval/ranking modules are not in the production import graph and must not decide current dialogue wording.

## Dialogue voice

Each character has a `voiceProfile` in `src/character/character-registry.ts`. A voice profile is a distribution of tendencies, not a template or checklist. Global natural-dialogue rules live in the Worker `INSTRUCTIONS` prompt.

## Photo flow

### Ordinary and low-suggestive

1. OpenAI `gpt-image-2`.
2. If OpenAI does not produce the image after its applicable retry path: WaveSpeed `bytedance/seedream-v4.5/edit`.

### Medium/high intimate

Route directly to WaveSpeed `bytedance/seedream-v5.0-lite/edit`.

### No-refusal photo continuity

When the per-character `photoNoRefusalMode` is enabled, direct photo requests and short visual follow-ups inside a recent photo exchange are mechanically reconciled to send unless the current turn has a hard stop/pause/boundary or the character is sleeping. Continuations inherit the last sent photo intent (including suggestive level) unless the new request explicitly changes it.

### References

- OpenAI ordinary branch: avatar reference.
- WaveSpeed: identity-sheet first; avatar only if identity-sheet is absent.
- A reference from one character must never be used for another.

### WaveSpeed multi-key

Submission can fail over across `WAVESPEED_API_KEY`, `_2` ... `_10`. Polling can locate tasks across configured keys. Account-level credit/auth failures are treated as credential failures; bad credentials receive a short process-local cooldown so every new request does not immediately hit the same dead key again.

## Persistence boundaries

`SCHEMA_VERSION=4` remains unchanged. Firebase/Auth/Firestore/App Check/live-sync contracts are intentionally preserved.
