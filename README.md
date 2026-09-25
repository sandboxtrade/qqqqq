YUZUKI v0.17.5 — initiative + stronger emotional expression

Changes:
- More initiative inside normal GPT-first dialogue.
- Adds an initiative profile derived from curiosity, affection, closeness, boredom, connection drive, intimacy initiative and tension/energy.
- Stronger emotional expression in wording/rhythm without turning Yuzuki theatrical.
- Proactive messages can surface somewhat more often, while still blocking duplicates/unanswered proactive messages.
- Spontaneous initiatives can now come from affection/boredom/connection drive, not only high curiosity.
- Evening shared-activity and relationship check-ins are slightly easier to trigger.
- SCHEMA_VERSION remains 4. No Firestore migration.

Install:
1. Overlay the patch over the current project with replacement.
2. Replace the Cloudflare Worker code with cloudflare/worker.js and Deploy.
3. Do not change OPENAI_API_KEY or Cloudflare secrets.
