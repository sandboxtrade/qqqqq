# Yuzuki GPT-first conversation worker

From v0.17.0 this Worker is the normal dialogue-generation path for Yuzuki. The browser sends the current user message plus a compact state/context packet. GPT writes the final conversational reply. Local Brain remains authoritative for durable memory, personality, emotions, relationship, world state, romance/intimacy boundaries, persistence and hard character constraints.

Production endpoint:

`https://shy-unit-ebfb.ermilov-stepa228337.workers.dev/yuzukiSpeak`

Required Cloudflare secret:

`OPENAI_API_KEY`

Never commit the API key to the repository. The client authenticates every request with Firebase Auth and Firebase App Check. If Worker/Auth/App Check/OpenAI fails, the existing local renderer is used as a resilient fallback.

The Worker uses OpenAI Responses API structured outputs. It returns the visible `text` plus small conversation metadata for diagnostics/future memory routing. The Worker never writes Firestore or mutates Yuzuki state directly.

Deploy source: `cloudflare/worker.js`.
