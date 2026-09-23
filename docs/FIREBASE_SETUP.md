# Firebase setup — v0.5

The app can run without Firebase in temporary in-memory mode. Persistent memory requires Firebase.

## Required services

1. Firebase Web App
2. Cloud Firestore (Standard edition)
3. Authentication → Google provider
4. Firebase AI Logic → Gemini Developer API
5. App Check → reCAPTCHA Enterprise for the deployed web app

## 1. Environment file

Copy `.env.example` to `.env.local` and fill in the Firebase Web App values shown in Firebase Console → Project settings → Your apps.

Do not commit `.env.local` to GitHub. It is already ignored by `.gitignore`.

## 2. App Check

Production:

- create a reCAPTCHA Enterprise Web key for the deployment domain
- put its site key into `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`
- keep `VITE_APP_CHECK_DEBUG=false`

Local development:

- keep the same site key
- set `VITE_APP_CHECK_DEBUG=true`
- launch the app once and copy the debug token printed by Firebase in the browser console
- register the token in Firebase Console → App Check → Manage debug tokens

A previously registered token can be supplied through `VITE_APP_CHECK_DEBUG_TOKEN`.

## 3. Authentication

The UI waits for Firebase Authentication before touching persistent companion data. When no session exists, it displays Google sign-in.

Add each deployment hostname to Firebase Authentication → Settings → Authorized domains. For GitHub Pages this is normally `USERNAME.github.io`.

## 4. Firestore rules

Open Firestore → Rules, replace the rules with the included `firestore.rules`, then publish.

Data is stored below:

`users/{signedInUid}/characters/{characterId}/...`

The included rules allow a signed-in user to access only paths under their own UID.

## 4.1 Firestore indexes

This version filters and orders memory documents on the server before applying `limit`.
Create/deploy the composite indexes from the included `firestore.indexes.json` before
using a large persistent database. `firebase.json` points the Firebase CLI at both the
rules and index files. The important indexed collections are `memories`,
`knowledge`, and `openThreads`. If an index is missing, Firestore will reject the query
instead of silently falling back to the old incorrect client-side ordering.

## 5. GitHub Pages

Vite uses `base: './'`, so the production bundle works when hosted from a repository subpath such as:

`https://USERNAME.github.io/REPOSITORY/`

The source repository itself is not the deployment domain. The hostname used for reCAPTCHA/App Check is `USERNAME.github.io`.
