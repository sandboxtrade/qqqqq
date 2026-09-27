# v0.20.14

## Photo viewer
- Generated chat photos can now be tapped to open in a full-screen viewer.
- Viewer respects iPhone safe-area, supports tap-outside/close button and Escape.

## WaveSpeed delivery hardening
- WaveSpeed fallback is now a two-step flow: `/yuzukiPhoto` returns a task id immediately, then the client polls `/yuzukiPhotoResult`.
- A transient lost poll no longer discards an already-running/finished WaveSpeed generation.
- Completed WaveSpeed output download has its own retry/timeout budget.
- Provider task id is preserved for diagnostics.

## Post-generation recovery
- Generated images are written to IndexedDB before the immutable chat event.
- If Firestore/event persistence fails after generation, the deterministic local cache is reused and the app retries delivery without paying for a second generation.
- Existing photo cache records remain compatible; no Firestore schema or path changes.

ENGINE_VERSION=0.20.14
SCHEMA_VERSION=4
