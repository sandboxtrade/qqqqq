# Release v0.20.24

## Ordinary photo moderation isolation

- Direct ordinary photo requests now mechanically force `suggestiveLevel=none`; they no longer inherit intimate framing from relationship/intimacy state or GPT output.
- Local request parsing now preserves ordinary framing such as `в полный рост` instead of only applying framing patches to suggestive requests.
- Ordinary photo pose/outfit/mood fields are sanitized to remove accidental sexual/suggestive carry-over.
- OpenAI ordinary-photo prompts now positively specify fully clothed everyday casual photography and neutral body language.
- If two reference-based OpenAI attempts still fail, the third ordinary-photo attempt uses text identity only (no image reference), preventing a problematic source avatar/edit-conditioning from repeatedly causing output moderation.
- WaveSpeed remains the final fallback.
- If the first OpenAI reference-conditioned ordinary image is blocked specifically at output moderation as sexual, the next retry immediately switches to text-only identity instead of repeating the same avatar conditioning.
