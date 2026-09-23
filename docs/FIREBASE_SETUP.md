# Firebase setup — v0.9.0

Firebase is used for account, persistence, memory/event storage and live sync. It is **not** required for Local Dialogue generation. Gemini/Firebase AI Logic is not a required service for normal chat.

## Required services for persistent production use

1. Firebase Web App
2. Cloud Firestore (Standard edition)
3. Authentication → Google provider
4. App Check → reCAPTCHA Enterprise for the deployed web app

Firebase AI Logic is optional legacy/future infrastructure only. The v0.9.0 runtime does not import it on the normal response path.

## 1. Environment file

Copy `.env.example` to `.env.local` and fill in the Firebase Web App values shown in Firebase Console → Project settings → Your apps.

Do not commit `.env.local` to GitHub. It is ignored by `.gitignore`.

## 2. App Check

Production:

- create a reCAPTCHA Enterprise Web key for the deployment domain;
- put its site key into `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`;
- keep `VITE_APP_CHECK_DEBUG=false`.

Local development:

- keep the same site key;
- set `VITE_APP_CHECK_DEBUG=true`;
- launch once and copy the debug token printed by Firebase;
- register it in Firebase Console → App Check → Manage debug tokens.

A previously registered token can be supplied through `VITE_APP_CHECK_DEBUG_TOKEN`.

## 3. Authentication

The UI waits for Firebase Authentication before touching persistent companion data. When no session exists, it displays Google sign-in.

Add each deployment hostname to Firebase Authentication → Settings → Authorized domains. For GitHub Pages this is normally `USERNAME.github.io`.

## 4. Firestore rules/indexes

Publish the included `firestore.rules` and deploy `firestore.indexes.json`. Data remains under:

`users/{signedInUid}/characters/{characterId}/...`

The included rules allow a signed-in user to access only paths under their own UID.

## 5. GitHub Pages

Vite uses `base: './'`, so the production bundle works from a repository subpath such as:

`https://USERNAME.github.io/REPOSITORY/`

The reCAPTCHA/App Check hostname is `USERNAME.github.io`.
