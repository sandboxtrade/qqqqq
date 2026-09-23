# Firebase runtime config

Production GitHub Pages reads public Firebase client settings from:

`public/runtime-config.js`

Fill only these public client identifiers:

- Firebase Web App `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`
- reCAPTCHA Enterprise site key / key ID

Do not place service-account JSON, private API secrets, passwords, or App Check debug tokens in this file.

The app still supports local `.env.local` values. Environment variables take precedence over `runtime-config.js`, so local development can continue using `.env.local` if desired.


## Production fail-closed behavior

Starting with v0.5.6, the production build never silently falls back to the in-memory repository. All Firebase Web App fields listed above must be present, and production also requires the reCAPTCHA Enterprise site key. If configuration is missing or partial, startup remains unavailable and shows a configuration error instead of opening a volatile local chat.

The in-memory repository is allowed only for development when no Firebase configuration is supplied at all. A partially filled Firebase configuration is treated as an error even during development so that mistakes are not hidden by a local fallback.
