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
