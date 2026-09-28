# Release v0.20.27

## Photo routing update

- Ordinary and low-suggestive photos now route as: OpenAI -> MiniMax H3 -> WAN 2.6.
- Intimate medium/high photos route directly to WAN 2.6.
- WaveSpeed still prefers `identity-sheet.jpg`; if absent it falls back to `avatar.jpg`.
- Photo-result polling now accepts an optional `model` field for explicit WaveSpeed model polling.
