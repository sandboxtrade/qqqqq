# Game2 v0.21.1 — photo infrastructure restored

Preserved from v0.20.60 (without restoring previous characters):

- OpenAI `gpt-image-2` photo generations / reference edits
- WaveSpeed Seedream 4.5 Edit, Seedream 5 Lite Edit, Qwen Image Edit
- Provider fallback routing and classified photo intents
- signed WaveSpeed async task IDs, image polling, retry across API keys and download recovery
- local per-message image storage, Firestore image messages and photo job persistence
- Firebase Auth / App Check request guards and process-local rate limits

New v0.21.0 experience remains: Alexandra, chat, presence screen, social screen, zero starting relationship, GPT-only presence photography. No legacy profile is selectable or used as an image identity reference.

Chat reference edits require `public/assets/profiles/alexandra/avatar.jpg` to be published with a deployment later. Without reference, the chat image pipeline returns a missing-reference result rather than silently copying an old girl's face. The separate `alexandraPresencePhoto` route can generate new GPT scenes but does not yet guarantee facial consistency.

No GitHub/Cloudflare write or secret change performed. Exact source baseline is v0.21.0 generated ZIP; v0.20.60 used **only** to restore accidentally discarded provider code.

The generic Firebase AI / Gemini client module (`src/ai/gemini-client.ts`) is also retained as an inactive optional integration. The active conversation path remains OpenAI GPT.
