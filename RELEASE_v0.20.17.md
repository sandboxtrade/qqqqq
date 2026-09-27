# v0.20.17 — Distinct character voices

## Goal
Stop the cast from converging on one generic GPT chat style. Every character now has a stable, non-editable surface voice layer in addition to editable Personality and Memory.

## Dialogue
Added explicit `voiceProfile.styleGuide` for:
- Yuzuki — natural balanced chat, dry humor, calm disagreement.
- Mika — fast bursts, energetic slang, impulsive teasing.
- Rin — laconic, observant, deadpan, minimal punctuation noise.
- Aiko — confident, controlled provocation and direct flirting.
- Hina — existing shy/soft voice retained.
- Lea — spontaneous, chaotic messenger rhythm, self-corrections and quick humor.
- Sofia — concise, composed, precise adult delivery.
- Eva — warm, flowing, lightly self-ironic adult voice without therapist language.
- Nora — mature, exact, very calm, dry and economical speech.

The Worker prompt now treats `VOICE STYLE` as a mandatory surface constraint for rhythm, bubble length, punctuation, humor, flirting and photo reactions, unless current mechanical state requires otherwise.

## Photos
Added character-specific `expressionGuidance` to every character visual profile. The image pipeline now preserves not only identity but also the intended visual manner: Yuzuki natural, Mika energetic, Rin restrained, Aiko confident, Hina shy/blushing, Lea spontaneous, Sofia composed, Eva warm/relaxed, Nora mature/confident.

## No-refusal fallback
The rare server-side text fallback used when no-refusal photo mode overrides a generated verbal refusal is now character-specific instead of returning the same generic `Сейчас.` for everyone.

## Compatibility
- ENGINE_VERSION: 0.20.17
- SCHEMA_VERSION: 4 (unchanged)
- Firebase/Auth/Firestore/App Check/live-sync/persistence contracts unchanged.
- Existing saved Personality/Memory does not need migration: `voiceProfile` comes from the character registry each turn.
