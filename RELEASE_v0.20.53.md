# v0.20.53 — Chat scroll stability

- Replaced nested `scrollIntoView()` auto-scroll with direct scrolling of the chat container only.
- Bottom pinning is now synchronous before paint while the reader is already at the bottom.
- Incoming streaming text, typing/status changes and image load resize keep the bottom stable without moving the surrounding page.
- Manual scrolling upward disables auto-follow and shows the existing new-message control instead.
- Character changes reset the scroll anchor correctly.
- Composer height changes no longer visually pull the conversation upward.
- Disabled browser scroll anchoring inside the chat scroller to avoid fighting the app's explicit anchor logic.

`ENGINE_VERSION = 0.20.53`
`SCHEMA_VERSION = 4`
