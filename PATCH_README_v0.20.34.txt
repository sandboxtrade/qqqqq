Patch v0.20.34 — intimacy/photo/speech deep consistency audit
Base: v0.20.33
SCHEMA_VERSION remains 4.

Key fixes:
- active current-turn stop/pause/boundary outranks photoNoRefusalMode
- intimate photo requests no longer mechanically escalate intimacy state
- direct photo intent remains canonical even when disposition=choice and GPT elects to send
- ordinary direct photos cannot inherit suggestive level from intimacy state
- generic sexy/seductive request no longer auto-escalates to high
- Russian refusal detection no longer relies on ASCII-style \b boundaries
- speech/send contradiction is reconciled for every direct photo that is actually sent
- intimacy mind reflection is descriptive state, not hidden dialogue instruction
- OpenAI low-suggestive and WaveSpeed prompts use intimacyTone only for expression/body language, never exposure/escalation
- focused intimacy/photo/speech test added
