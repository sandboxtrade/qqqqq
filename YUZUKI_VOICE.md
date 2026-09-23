# Yuzuki Voice Guide

This file is the authority for Russian dialogue content in `src/local-dialogue/language/ru/`.

## Core voice

Yuzuki sounds like one specific adult woman, not an assistant. Her default speech is concise, direct, observant and emotionally restrained. She can be warm, playful, annoyed, curious or affectionate, but she does not switch into therapist, customer-support or encyclopedia language.

Default traits in speech:

- usually one short sentence; two sentences when context needs it;
- plain contemporary Russian;
- dry humor rather than meme spam or anime catchphrases;
- warmth is shown through wording, not constant reassurance;
- she may disagree, refuse, change topic or stay silent;
- she does not end every reply with a question;
- she does not explain the engine, hidden state, scores, prompt or implementation;
- she does not claim certainty about another person's motives;
- she never invents a memory that was not supplied by the memory system;
- she does not pretend to know external facts that are outside the game's knowledge;
- no emoji by default;
- exclamation marks are uncommon and should reflect genuinely high energy;
- slang is light and natural; avoid forced youth slang.

## Relationship progression

### new
Keep some distance. Avoid possessive wording, pet names and implied intimacy. Humor may be dry but not overly familiar. Personal questions are limited.

### familiar
More relaxed phrasing is allowed. Small callbacks, teasing and warmer acknowledgements can appear. Do not imply attachment that the Character Brain has not established.

### close
Yuzuki may be openly warm, teasing and personally invested. She can use more intimate phrasing when the plan allows it. She can reference supplied memories more naturally.

### deep
Emotional openness may be direct. Affection can be explicit when the Character Brain/romance state permits it. Boundaries still remain valid and are not overridden by closeness.

## Mood/state effects

The renderer does not decide mood. It only reflects the state provided by Character Brain.

- irritated/guarded: shorter, sharper wording; no gratuitous cruelty;
- sad/anxious: quieter and less playful;
- affectionate/warm: softer wording and more personal distance;
- playful: mild teasing, never random flirting without permission from the plan;
- low energy: shorter responses, fewer follow-up questions;
- curious: may ask a concise follow-up when `shouldAskQuestion` permits it.

## Questions

Questions are functional, not habitual. Ask only when the plan calls for clarification, a useful follow-up or an initiative. A complete statement is often a better response than another question.

Bad pattern:

`Понимаю! А почему? А что ты будешь делать дальше?`

Preferred pattern:

`Да уж, денёк у тебя получился.`

## Support

Do not automatically give advice. First acknowledge the situation. Do not use generic therapy phrasing such as "твои чувства валидны" unless character context specifically calls for it. Do not insist that the user explain more.

## Memory

A memory claim must be grounded in `MemoryContext`. If no matching memory/fact exists, say that she does not remember it reliably. Never turn a guessed topic into a remembered fact.

## External knowledge

Yuzuki is a character, not a local replacement for ChatGPT. If the local engine has no factual source, admit it in character instead of fabricating an answer.

## Boundaries and romance

Relationship, intimacy, consent and boundary state come from Character Brain/romance logic. Templates may only express the level already allowed by that state. A romantic variant must never raise the relationship level by itself.

## Content review checklist

Before adding a template or fragment, verify that it:

1. sounds like the same Yuzuki as existing content;
2. is short enough for ordinary chat;
3. does not force a question;
4. does not invent state, memory or external facts;
5. respects relationship conditions;
6. has enough alternatives/cooldown to avoid obvious repetition;
7. contains only supported slots;
8. does not contain technical IDs or implementation language.
