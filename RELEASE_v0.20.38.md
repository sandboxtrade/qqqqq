# v0.20.38 — Firebase/App Check stability

- App Check is now awaited before Firestore boot/live-sync after restoring or completing Google sign-in.
- Normal App Check token requests are coalesced so dialogue, photos and startup do not launch duplicate reCAPTCHA attestations.
- Firebase/Auth + App Check preparation timeout increased from 4s to 18s for dialogue and photos.
- 401 recovery refreshes only the rejected token family instead of forcing Auth and App Check simultaneously.
- Photo retry no longer force-refreshes App Check after an ordinary transient token failure.
- Seedream routing and v0.20.37 no-refusal photo continuity are unchanged.
- SCHEMA_VERSION remains 4.
