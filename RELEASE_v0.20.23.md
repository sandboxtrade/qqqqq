# Release v0.20.23

## OpenAI ordinary-photo stabilization

- Ordinary non-explicit photo requests now use a dedicated simpler OpenAI prompt path instead of the generic photo prompt.
- Added up to 3 OpenAI attempts for ordinary photos before fallback to WaveSpeed.
- Added a minimal OpenAI fallback prompt specifically to improve ordinary full-body photo success rate.
- Increased OpenAI image timeout slightly for slow successful generations.
