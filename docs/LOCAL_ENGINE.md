# Local State Engine — current note

The old v0.9 Local Dialogue / Local NLU / planner / renderer architecture is no longer the production dialogue path.

## Active responsibility

The local runtime still owns mechanical and durable state:

- personality source data;
- canonical editable long-term memory;
- emotion values and decay;
- relationship values;
- intimacy state, stop/pause/boundary enforcement and bounded reactions;
- world/activity/sleep/availability;
- event persistence and revision rules.

`src/engine/runtime.ts` orchestrates those systems and sends a bounded context packet to the GPT-first language layer.

## Language

Normal visible dialogue is generated through:

`src/ai/cloud-language.ts -> Cloudflare /yuzukiSpeak -> gpt-6-luna`

The old files under `src/local-dialogue/`, old cognition dialogue planning, semantic retrieval and legacy Gemini adapters are not reachable from the production `src/main.tsx` import graph. They remain only as legacy/test material until removed together with the tests that still import them.

## Fallback

If cloud language fails, the active runtime intentionally does not revive the old template engine as a second speaker. Only hard mechanical constraints have tiny local fallback phrases; ordinary production transport failures surface as retryable errors.
