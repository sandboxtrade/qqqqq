# v0.20.52 — Diana character

Adds a new canonical adult character `diana_v1` (Диана, 35).

- distinct high-status, assertive, strongly flirt-initiating personality;
- relationship background with a wealthy partner and two children, without an automatic fidelity refusal;
- unique voice style, interests, conflict style and initiative profile;
- independent world/activity routine;
- avatar, three profile gallery photos and an identity-sheet fallback;
- Cloudflare profile slug mapping for generated-photo references;
- dedicated regression coverage plus updated social/personality diversity tests.

`ENGINE_VERSION = 0.20.52`
`SCHEMA_VERSION = 4`

Because `cloudflare/worker.js` changes, deploy the Worker after applying the patch.
