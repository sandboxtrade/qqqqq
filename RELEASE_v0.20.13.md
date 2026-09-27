# v0.20.13

- Fixed no-refusal photo mode so Worker reconciliation now keeps the chat text/caption consistent with the forced photo decision instead of allowing a verbal refusal followed by a photo.
- Expanded Russian morphology detection for suggestive photo requests (including forms such as «голых», «без белья», etc.) so they are no longer misclassified as ordinary photos.
- When no-refusal mode forces a suggestive direct photo request, a small local sanitizer preserves the requested visual class (for example mirror/full-body/topless/nude/lingerie) inside structured Photo Intent if GPT tried to downgrade it. Raw chat is still never passed directly to the image generator.
- Increased OpenAI Images timeout from 35s to 105s. OpenAI documentation notes complex image requests may take up to two minutes.
- Added one OpenAI retry for transient 429/5xx image failures before WaveSpeed fallback. Ordinary moderation retries still use the separate neutral retry prompt.
- Increased frontend photo-worker timeout to 185s so OpenAI has time to finish before fallback without the browser aborting the whole request.
- Persisted provider/primary failure diagnostics in generated photo event payloads for easier debugging.
- SCHEMA_VERSION remains 4; Firebase/Auth/App Check/live-sync paths are unchanged.
