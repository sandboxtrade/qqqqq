Yuzuki v0.19.7 — Intimacy Visual Sync + Faster Scene Switching

Fixes:
- GPT now reports signals.intimacyTone from Yuzuki's OWN generated reply: none/flirty/aroused/high_arousal.
- flirty/horny portraits can immediately reflect what Yuzuki actually says, without changing consent state.
- sx can start after GPT output when the mechanical intimacy state is already intimate/high_intimacy, open, adult-enabled and sufficiently aroused; high_arousal does not create consent or bypass pause/stop.
- mature visual scores were rebalanced so horny is reachable at real mechanical arousal instead of losing to generic warm/flirty states.
- ready_to_chat can no longer mask a strong emotional/intimacy reply.
- same-emotion visual hold reduced from 35s to 8s; cross-emotion hold from 7s to 2s.
- image switching no longer waits for an extra explicit decode before showing a loaded scene.
- when adult mode is enabled, flirty/horny/hornys and sx1 are warmed in the browser cache; during sx the next step is warmed automatically.
- carries the v0.19.6 TypeScript null-narrowing build fix.

Architecture:
- SCHEMA_VERSION stays 4.
- GPT does not directly mutate consent/boundaries or intimacy phase.
- pause/stop/hard constraints remain local and higher priority.
- no Firebase/Auth/App Check/live-sync/revision contract changes.
- no scene photos are included or modified.
- cloudflare/worker.js changed and must be deployed separately.
