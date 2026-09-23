# Intimacy architecture — foundation v0.7.0

This module is an adult-only extension of the same persistent character. It is not a second chatbot and it is not active in the current conversation runtime yet.

## Non-negotiable invariants

- Yuzuki is fixed as an adult character: `age = 24`, `adult = true` in Character Core.
- Character Core, relationship, emotion, memory and world remain authoritative inputs.
- Gemini never decides whether an intimate interaction is allowed, paused, refused or stopped.
- Past consent never becomes automatic consent for a later interaction.
- A pause/refusal/stop cannot be converted into consent by language generation.
- Neutral technical scene IDs are used in engine/persistence. Graphic scene descriptions do not belong in core logic.
- The adult module stays disabled until `adultModeEnabled` is explicitly enabled by product/UI logic in a later stage.

## Current stage A implementation

Files:

- `src/intimacy/intimacy-types.ts`
- `src/intimacy/intimacy-state.ts`
- `src/intimacy/intimacy-core.ts`
- `src/intimacy/index.ts`

Persistent documents:

- `users/{uid}/characters/{characterId}/intimacy/state`
- `users/{uid}/characters/{characterId}/intimacy/preferences`

Both documents use the normal storage codec and `STORAGE_SCHEMA_VERSION`. They have independent optimistic `revision` fields so two tabs/devices cannot silently overwrite each other.

### IntimacyState

The state currently reserves the following neutral runtime dimensions:

- `adultModeEnabled`
- `phase`: `normal | romantic | close | intimate | high_intimacy | aftercare | paused`
- `interactionStatus`: `inactive | open | hesitant | paused | stopped`
- `comfort`
- `interest`
- `arousal`
- `initiativeDrive`
- optional neutral `activeScene`
- cooldown/boundary timestamps
- `storagePolicy`: `full | memories_only | disabled`

The fields exist now so later engines do not need to retrofit persistence. They do not currently affect chat behavior.

### Neutral scene IDs

Persisted scene IDs must use forms such as:

- `scene.private.close_01`
- `stage.close_01`
- optional pose ID such as `pose.close_01`

The persistence codec rejects non-neutral `sceneId`/`stageId` strings.

### Preferences

`intimacy/preferences` is a versioned evidence document containing structured preferences with:

- stable ID/topic key;
- stance;
- strength/confidence;
- `core` or `learned` origin;
- source event IDs;
- validity timestamps;
- optional supersession link.

This keeps learned preferences evidence-backed instead of letting Gemini invent permanent character traits.

## What is deliberately NOT implemented in stage A

- no automatic entry into intimacy mode;
- no parsing of intimate user intent;
- no intimacy decision/consent state machine;
- no Gemini intimacy prompt;
- no intimacy event generation;
- no memory extraction from intimacy events;
- no intimacy initiative;
- no visual/private-scene resolver;
- no adult-mode UI toggle yet.

Therefore v0.7.0 should behave like v0.6.2 in normal chat.

## Planned next stages

### Stage B — Decision Engine

Add local eligibility/transition decisions using Character Core, relationship, emotion, world privacy/availability, cooldown and current state. The local engine owns allow/hesitate/not-now/boundary/stop and all state transitions.

### Stage C — Memory + relationship integration

Add meaningful intimacy raw events, preference learning/supersession, relationship/emotion effects, aftermath/aftercare and initiative integration. Storage policy must be respected when deciding how much detail to persist.

### Stage D — Visual runtime

Connect neutral scene/pose/clothing state to the future layered asset resolver. The intimacy engine must remain independent of concrete image filenames and graphic descriptions.

### Stage E — End-to-end integration

Normal chat → romantic context → local eligibility → intimate state → completion/aftercare → normal chat, including reload, device conflict, memory continuity and failure recovery.
