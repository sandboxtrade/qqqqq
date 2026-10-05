# Current Architecture — v0.20.49

## Core principle

Dialogue is GPT-first. Canonical state is mechanical/local-state-first.

The engine owns character state, emotion, relationship, intimacy constraints, world/activity, persistence and revisions. GPT owns natural-language generation plus bounded reaction/photo suggestions.

## Character context

Every GPT turn receives immutable `CHARACTER PROFILE` anchors from `src/character/character-registry.ts` independently of editable Firestore personality. This keeps old accounts from collapsing characters into one generic voice.

## World

Normal chat does not replace the actual current activity/location with `chatting`. Characters can work, walk, read, eat, listen to music or remain outside while replying. Sleep/current-turn hard boundaries remain above optional photo overrides.

## Photo mechanics

1. Worker mechanically detects direct photo requests and active-session follow-ups.
2. `derivePhotoIntentPatch()` is the single visual-modifier parser.
3. Continuations inherit the previous sent-photo intent and overwrite only explicitly changed fields.
4. Mechanical photo intent outranks GPT-generated visual choices.
5. Provider-specific prompt builders receive the resolved intent.

Direct/no-refusal handling supports natural phrases such as `скинь фото`, `давай фото`, `можно фотку?`, `фото в полный рост`, `ещё фотку`, plus active-session modifiers such as `в ванной`, `на кровати`, `в серых лосинах`, `топлесс`, `со спины`, `обернись`.

### Provider routing

- ordinary / low -> `gpt-image-2`, then Seedream 4.5 Edit fallback;
- medium / high -> Seedream 5.0 Lite Edit directly;
- WAN 2.6 / MiniMax H3 are not part of production routing.

### Seedream references

WaveSpeed receives exactly one character reference. Production order is clean avatar first, identity-sheet fallback only. This reduces collage/frame contamination from multi-view sheets.

### Photo job lifecycle

Deferred user-photo jobs are registered in a cancellable job map. Runtime `invalidate()` clears pending timers and aborts active provider requests, preventing old photo work from surviving reset, character switch or sign-out.

## Inbox/UI state

Messages contains only characters with existing conversation history. Per-character refresh errors preserve known inbox membership/previews instead of being interpreted as an empty conversation. Auth UID changes clear inbox metadata immediately.

Generated/proactive messages update inbox previews directly and do not rely solely on live-sync.

## Persistence

`SCHEMA_VERSION = 4` remains unchanged. Firestore paths, state/world revision pairing, App Check and live-sync contracts are preserved.
