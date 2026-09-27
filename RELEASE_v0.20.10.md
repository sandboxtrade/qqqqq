# Release v0.20.10 — WaveSpeed WAN 2.6 Image Edit

- WaveSpeed fallback model changed from `wavespeed-ai/qwen-image/edit-2511` to `alibaba/wan-2.6/image-edit`.
- Submit endpoint changed to `https://api.wavespeed.ai/api/v3/alibaba/wan-2.6/image-edit`.
- Request payload now uses WAN 2.6 Image Edit fields: `prompt`, `images`, `enable_prompt_expansion: false`.
- Existing per-character reference routing is preserved.
- OpenAI remains the primary image provider; WaveSpeed WAN 2.6 remains the fallback.
- `SCHEMA_VERSION` remains 4. No Firebase migration is required.

After uploading the patch to GitHub, copy/deploy the updated `cloudflare/worker.js` to Cloudflare Worker `shy-unit-ebfb`.
