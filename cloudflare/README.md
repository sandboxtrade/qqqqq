# Yuzuki Cloudflare language worker

This Worker is only the optional OpenAI wording layer. The Local Brain remains authoritative for memory, personality, emotions, relationship, intimacy, decisions, and persistence.

Production endpoint:

`https://shy-unit-ebfb.ermilov-stepa228337.workers.dev/yuzukiSpeak`

Required Cloudflare secret:

`OPENAI_API_KEY`

Do not commit the API key to this repository. The browser client sends a Firebase Auth ID token and a Firebase App Check token to the Worker. If the Worker, Auth, App Check, quota, budget guard, or OpenAI request fails, the app keeps the already-generated local reply.

The deployed Worker source is `cloudflare/worker.js`.
