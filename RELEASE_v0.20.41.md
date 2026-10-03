# v0.20.41 — seedream 18+ prompt quality fix

Base: v0.20.40. SCHEMA_VERSION remains 4.

## What changed
- Strengthened WaveSpeed/Seedream intimate-photo prompts so medium/high requests stop collapsing into ordinary casual photos.
- Added explicit exposure instructions for topless, nude / without-underwear, and lingerie requests.
- Added stronger anatomy guidance to reduce malformed upper-body / chest results in intimate photos.
- Extended Seedream prompt sanitization so person references in photo prompts stay on `woman / женщина` wording and avoid `girl / девушка / девочка / lady / female` style labels.

## Compatibility
- Firebase/Auth/Firestore/App Check behavior unchanged from v0.20.40.
- Cloudflare Worker must be redeployed because the fix lives in `cloudflare/worker.js`.
- ENGINE_VERSION=0.20.41.
