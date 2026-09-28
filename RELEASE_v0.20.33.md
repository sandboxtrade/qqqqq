# Release v0.20.33 — Photo pipeline reliability audit

Base: v0.20.32. SCHEMA_VERSION remains 4.

## Fixed

- OpenAI ordinary/low photo generation now requires a real avatar reference. If the avatar cannot be loaded, OpenAI is skipped and routing continues to WaveSpeed instead of silently generating a different face from text only.
- OpenAI moderation retry keeps the same avatar reference; the retry no longer drops identity just to bypass moderation.
- GitHub reference downloads now have a bounded timeout, image content-type validation and a size cap. Broken HTML/text responses are not accepted as character references.
- WaveSpeed multi-key submit now has a per-key timeout and a total failover budget, so several dead keys cannot hold one photo request for minutes.
- WaveSpeed result polling now has a per-key timeout and total budget. The browser passes the credential attempt that created the task, so the Worker checks the likely owning account first instead of scanning every key on every poll.
- Worker result timeouts are now compatible with frontend polling timeout; slow result/output fetches no longer get cut off by the browser before the Worker can answer.
- WaveSpeed output downloads validate image content type and size.
- WaveSpeed cooldown is tied to an anonymized fingerprint of the actual secret key rather than its `primary/slot-N` position. Replacing a dead secret in the same Cloudflare slot no longer inherits the old key's cooldown.
- MiniMax pending -> WAN escalation can retry after a transient re-check failure instead of permanently disabling WAN escalation for that task.
- WaveSpeed HTTP error details now preserve nested provider messages for diagnostics.
- OpenAI base64 output is validated without silent truncation.

## Verified routing

- none/low: OpenAI gpt-image-2 -> MiniMax H3 -> WAN 2.6.
- medium/high: direct WAN 2.6.
- OpenAI receives avatar reference only.
- WaveSpeed receives identity-sheet first, avatar fallback only when identity-sheet is absent.
- WaveSpeed task polling follows GET `/api/v3/predictions/{task-id}/result` and stops on terminal statuses.
- WaveSpeed multi-key retry remains server-side only.

## Unchanged

- SCHEMA_VERSION=4.
- Firebase/Auth/Firestore/App Check/live-sync/persistence contracts.
- No OpenAI/WaveSpeed API key is added to frontend/runtime-config/GitHub.
