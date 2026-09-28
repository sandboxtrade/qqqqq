# Release v0.20.26

## Provider routing correction

- Ordinary and low-suggestive photos use OpenAI Images only.
- Medium/high intimate photos bypass OpenAI image generation and route directly to WaveSpeed MiniMax H3 Image Edit.
- WaveSpeed model changed from `alibaba/wan-2.6/image-edit` to `wavespeed-ai/minimax-h3/image-edit`.
- H3 receives exactly one character reference: `identity-sheet.jpg` when present, otherwise `avatar.jpg`.
- H3 request uses 2:3 aspect ratio, 1K resolution and WebP output.
- WaveSpeed prompt refers to `<Picture 1>` explicitly, matching MiniMax H3 reference-image prompting.
- Ordinary-photo OpenAI retries remain unchanged and no longer silently fall through to WaveSpeed.
