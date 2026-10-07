# v0.20.56 — explicit photo prompt rewrite

## Main change
Medium/high intimate Qwen Image prompts are now generated in English only and use direct exposure instructions instead of vague labels.

### Internal intent labels remain internal
- `topless` -> final prompt explicitly describes fully uncovered breasts; the word `topless` is not sent to Qwen.
- `nude` -> final prompt describes a completely unclothed body; the words `nude`, `naked`, and `topless` are not sent to Qwen.
- `lingerie` -> final prompt explicitly requests visible bra and panties.

### Prompt structure
Explicit prompts are limited to the information that materially affects the image:
1. identity preservation
2. scene
3. framing
4. pose
5. exact clothing/exposure requirement
6. expression
7. realism/anatomy
8. output constraints

Long character personality descriptions, mixed Russian/English text, internal file paths and redundant intimacy commentary are excluded from the medium/high WaveSpeed prompt.

## Routing
- medium/high -> Qwen Image Edit 2511
- none/low -> existing OpenAI / Seedream fallback path

SCHEMA_VERSION remains 4.
