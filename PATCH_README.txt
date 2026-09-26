v0.20.2 build fix

Fixes the GitHub Actions errors shown after v0.20.2 upload:
- exports getFirebaseAppCheckToken() from src/storage/firebase.ts
- handles nullable getFirebaseApp() before getAuth() in src/ai/cloud-photo.ts
- uses result.trace?.cloudLanguage instead of result.trace.cloudLanguage in src/app/store.ts

This patch is applied ON TOP OF v0.20.2.
No Firestore paths/schema/revision logic changed.
No Cloudflare Worker change is included in this build-fix patch.
