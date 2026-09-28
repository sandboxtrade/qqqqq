# v0.20.35 — WaveSpeed insufficient-balance modal

## What changed
- Added a dedicated frontend modal when photo generation fails specifically because WaveSpeed balance/credits are insufficient.
- Photo failures now preserve provider/detail metadata strongly enough for the UI to distinguish balance exhaustion from generic generation errors.
- `persistGeneratedPhotoMessage()` now throws a typed `CloudPhotoGenerationError` instead of a plain generic error for failed cloud-photo generations.
- App store now keeps a `photoBalanceAlert` state and exposes `dismissPhotoBalanceAlert()`.
- Added modal UI in `App.tsx` and styling in `styles.css`.

## User-visible behavior
When all available WaveSpeed keys fail due to low balance / top-up required / insufficient credits, the user sees a separate popup explaining that WaveSpeed balance must be topped up, instead of only a generic failed-photo state.

## Version
- ENGINE_VERSION=0.20.35
- SCHEMA_VERSION=4
