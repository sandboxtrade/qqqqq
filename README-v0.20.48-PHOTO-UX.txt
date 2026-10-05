Game2 / Virtual Companion — v0.20.48 PHOTO + UX overhaul

Base: cumulative v0.20.47
ENGINE_VERSION: 0.20.48
SCHEMA_VERSION: 4 (unchanged)

PHOTO ENGINE
- Resolved photo continuation intent now mechanically merges prior photo context with only the fields explicitly changed by the current request.
- Switching from intimate clothing to ordinary clothing clears inherited suggestive exposure.
- Weak body-focus follow-ups no longer downgrade an already stronger ongoing photo intent.
- Better parsing for framing, rear/side/lying/seated poses, locations, colors and clothing.
- Provider prompt builders now use one compact canonical photo spec instead of repeatedly concatenating long developer-style blocks.
- WaveSpeed/Seedream prompts are primarily Russian and strip technical asset paths, identity-sheet filenames and redundant source-of-truth language.
- Direct-camera / selfie / mirror behavior is separated to reduce phones, screens, nested images and photo-in-photo artifacts.
- Composition presets and anatomy constraints are explicit and concise.
- Ordinary/low routing remains gpt-image-2 -> Seedream 4.5 Edit fallback.
- Medium/high remains direct Seedream 5.0 Lite Edit.
- WAN 2.6 and MiniMax H3 are not restored.

CHAT / PHOTO UX
- Chat photo previews preserve the generated image aspect ratio instead of hard-cropping every image.
- Fullscreen viewer supports + / - zoom, double-click zoom, caption, scrolling and safer mobile dimensions.
- Composer/touch targets/spacing/safe-area handling were polished for mobile.

MESSAGES / PEOPLE UX
- Messages uses actual last-conversation previews instead of static dating lines.
- Conversations are ordered by latest activity.
- User messages are prefixed with "Вы:"; photos get a compact camera preview marker.
- Time is shown as HH:mm today, "вчера", or DD.MM.
- Switching characters no longer wipes/rebuilds the entire inbox list visually.
- Clearing a conversation immediately removes that character from Messages until a new conversation starts.
- Added clearer empty states and larger mobile touch targets.

VALIDATION
- npm test: PASS (218 regression checks + all specialized suites)
- node --check cloudflare/worker.js: PASS
- npm run verify: test stage PASS; typecheck/build cannot proceed in this container because Vite dev packages are not installed (vite, @vitejs/plugin-react, vite/client).

DEPLOY
cloudflare/worker.js changed. Deploy the Cloudflare Worker after replacing files.
