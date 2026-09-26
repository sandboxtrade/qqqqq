Yuzuki v0.19.6 — Visual Variety + Initiative + Pose Reliability

Base: current v0.19.5 working tree (v0.19.3 authoritative baseline + applied v0.19.4/v0.19.5 patches).
SCHEMA_VERSION remains 4.

What changed
1) Visual loop / two-photo pinning
- Reduced relationship-only weighting of comfortable/confident so a close relationship does not dominate every visual state.
- Strong GPT turn emotion signals (jealous/hurt/irritated/sad/anxious/bored/tender/warm/curious) now receive immediate visual priority while mechanical emotion remains the persisted source of truth.
- While the world is already in `chatting`, reconciliation now keeps an emotion-driven portrait instead of repeatedly resolving `chatting` to the `ready_to_chat` activity frame.
- `ready_to_chat` is now a one-way transition bridge and cannot become a sticky picture after long pauses.

2) Pose/photo requests
- An explicit visual request now outranks the automatic ready-to-chat bridge.
- Ordinary non-suggestive requests such as `поменяй позу` no longer randomly refuse in a normal awake state.
- If the requested emotion bucket contains only one photo, an explicit request may borrow a nearby compatible emotional portrait so the visible pose actually changes.
- Added recognition for lying/reclining wording: `ляг`, `ложись`, `приляг`, `можешь лечь/прилечь`.
- Existing guard remains: ordinary phrases such as `сделай чай`, `покажи код`, `измени текст` are NOT visual requests.
- Suggestive/adult pose requests keep the existing intimacy/boundary gates.

3) Initiative
- First initiative check after 5 minutes of user silence instead of 1 hour.
- During the first 2 hours, recheck every 15 minutes; after that 30 minutes, then hourly.
- Successful proactive-message cooldown reduced to 45 minutes.
- Being occupied at home no longer blocks the GPT initiative check; sleeping still does.
- An unanswered proactive message still blocks another one, so this does not create spam.
- Worker prompt now treats ordinary partner behavior (random thought, missing the user, callback, teasing) as a valid natural reason to write first when the relationship is established.

Deployment
- Replace the files from this patch in GitHub while preserving `src/assets/character/scenes/` exactly as-is.
- `cloudflare/worker.js` changed. Copy it separately into Worker `shy-unit-ebfb` and Deploy.
- No Firebase/Auth/App Check/live-sync/revision contracts or Firestore paths were changed.
- No character photos are included in this patch.

Verification in audit environment
- npm test: PASS
  - 211 regression checks
  - 120 canonical NLU scenarios
  - 400-turn stress
  - AI transport PASS
  - Cloud dialogue PASS
- Full typecheck/build could not be run locally because node_modules / Vite type packages are not present in the audit working tree. GitHub Actions must confirm the normal build gate after upload.
