import type { CharacterCore } from '../character/character-types';
import type { EmotionalState } from '../emotions/emotion-types';
import type { MemoryContext } from '../memory/memory-types';
import type { RelationshipState } from '../relationship/relationship-types';
import type { WorldState } from '../world/world-types';
import type {
  CharacterDecision,
  CharacterInterpretation,
  InternalThought,
  Perception,
  PerceptionIntent,
  PerceptionTone,
  ResponsePlan,
} from './cognition-types';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function inferIntent(normalized: string): PerceptionIntent {
  if (/(прости|извини|сорри|sorry|apolog)/u.test(normalized)) return 'apology';
  if (/(люблю|скучал|скучаю|обожаю|love|miss you|missed you)/u.test(normalized)) return 'affection';
  if (/(пойд[её]м|давай посмотрим|давай сходим|хочешь пойти|let'?s go|watch together)/u.test(normalized)) return 'invitation';
  if (/(не хочу|не надо|перестань|не делай|не пиши|не звони|не трогай|оставь меня|хочу побыть один|хочу побыть одна|stop|don'?t|leave me alone)/u.test(normalized)) return 'boundary';
  if (/(не соглас|ты не права|это не так|wrong|disagree)/u.test(normalized)) return 'disagreement';
  if (/(можешь|сделай|скажи|покажи|дай|please|can you|could you)/u.test(normalized)) return 'request';
  if (normalized.includes('?')) return 'question';
  if (/(мне грустно|мне плохо|я устал|я боюсь|я переживаю|мне одиноко|i feel|i am tired|i'm tired)/u.test(normalized)) return 'disclosure';
  return normalized ? 'statement' : 'unknown';
}

function inferTone(normalized: string): PerceptionTone {
  if (/(ненавижу|бесит|заткнись|отстань|дура|идиот|hate|shut up|stupid)/u.test(normalized)) return 'irritated';
  if (/(груст|плохо|одинок|печаль|sad|lonely|hurt)/u.test(normalized)) return 'sad';
  if (/(боюсь|тревож|пережива|страшно|anxious|worried|afraid)/u.test(normalized)) return 'anxious';
  if (/(люблю|скучал|милая|спасибо|приятно|love|miss|thanks|sweet)/u.test(normalized)) return 'warm';
  if (/(ахах|хаха|лол|шут|haha|lol|kidding)/u.test(normalized)) return 'playful';
  if (/(ладно|ясно|понятно|окей|whatever|fine\.?$)/u.test(normalized) && normalized.length < 40) return 'cold';
  return 'neutral';
}

function extractTopics(normalized: string) {
  const stop = new Set(['когда', 'потом', 'можешь', 'просто', 'очень', 'тогда', 'сейчас', 'there', 'about', 'would', 'could', 'please']);
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 3 && !stop.has(token))
    .slice(0, 7);
}

export function localPerception(text: string): Perception {
  const normalized = text.trim().toLowerCase();
  const intent = inferIntent(normalized);
  const tone = inferTone(normalized);
  const agreementPressure = /(согласна|согласен|правда же|ведь я прав|скажи что я прав|agree with me|right\?)/u.test(normalized) ? 0.82 : 0.08;
  const vulnerability = intent === 'disclosure' || tone === 'sad' || tone === 'anxious' ? 0.72 : tone === 'warm' ? 0.25 : 0.08;
  const urgency = /(срочно|прямо сейчас|немедленно|urgent|right now|immediately)/u.test(normalized) ? 0.9 : 0.12;
  const ambiguity = normalized.length < 8 ? 0.62 : /(?:нормально|не знаю|как-то|whatever|fine)/u.test(normalized) ? 0.48 : 0.18;

  return {
    literalMeaning: text.trim(),
    probableIntent: intent,
    tone,
    topics: extractTopics(normalized),
    emotionalSignals: [
      ...(tone === 'warm' ? ['warmth'] : []),
      ...(tone === 'irritated' ? ['anger_or_frustration'] : []),
      ...(tone === 'sad' ? ['sadness'] : []),
      ...(tone === 'anxious' ? ['anxiety'] : []),
      ...(vulnerability > 0.5 ? ['vulnerability'] : []),
    ],
    agreementPressure,
    vulnerability,
    urgency,
    ambiguity,
    confidence: normalized ? 0.58 : 0.1,
    source: 'local',
  };
}

export function mergePerceptions(local: Perception, model: Perception | null): Perception {
  if (!model) return local;
  // Model analysis can add nuance, but local literal text remains authoritative and extreme scores are bounded.
  return {
    ...local,
    probableIntent: model.probableIntent,
    tone: model.tone,
    topics: [...new Set([...model.topics, ...local.topics])].slice(0, 8),
    emotionalSignals: [...new Set([...model.emotionalSignals, ...local.emotionalSignals])].slice(0, 8),
    agreementPressure: clamp(local.agreementPressure * 0.55 + model.agreementPressure * 0.45),
    vulnerability: clamp(local.vulnerability * 0.45 + model.vulnerability * 0.55),
    urgency: clamp(Math.max(local.urgency, model.urgency * 0.8)),
    ambiguity: clamp(local.ambiguity * 0.4 + model.ambiguity * 0.6),
    confidence: clamp(Math.max(local.confidence, model.confidence * 0.9)),
    source: 'gemini',
  };
}

function inferLikelyNeed(perception: Perception): CharacterInterpretation['likelyUserNeed'] {
  if (perception.probableIntent === 'request') return 'action';
  if (perception.probableIntent === 'invitation') return 'connection';
  if (perception.probableIntent === 'affection') return 'connection';
  if (perception.probableIntent === 'question') return 'information';
  if (perception.probableIntent === 'boundary') return 'space';
  if (perception.vulnerability > 0.55) return 'reassurance';
  if (perception.tone === 'playful') return 'play';
  return 'unknown';
}

export function interpret(
  perception: Perception,
  memories: MemoryContext,
  emotions: EmotionalState,
  relationship: RelationshipState,
): CharacterInterpretation {
  const resonantMemories = memories.memories.slice(0, 3).map((memory) => memory.summary);
  const openThread = memories.openThreads[0];
  const guarded = emotions.irritation > 0.42 || relationship.unresolvedTension > 0.4;
  const likelyUserNeed = inferLikelyNeed(perception);

  let subjectiveReading = 'The message looks straightforward and does not require a strong assumption.';
  let alternativeReading: string | undefined;

  if (perception.vulnerability > 0.55) {
    subjectiveReading = 'He may be sharing something personal rather than asking for a solution.';
    alternativeReading = 'He may still want practical advice, so do not assume reassurance is the only useful response.';
  } else if (perception.agreementPressure > 0.6) {
    subjectiveReading = 'He appears to be checking whether she will validate his position.';
    alternativeReading = 'It may be a genuine request for her opinion rather than pressure.';
  } else if (perception.tone === 'cold' && perception.ambiguity > 0.35) {
    subjectiveReading = 'The short response feels cooler than usual, but the reason is uncertain.';
    alternativeReading = 'He may simply be busy or concise rather than upset.';
  } else if (guarded) {
    subjectiveReading = 'Existing tension makes the message easier for her to read defensively.';
    alternativeReading = 'Her irritation may be biasing the interpretation.';
  }

  return {
    summary: `${perception.probableIntent} / ${perception.tone}`,
    likelyUserNeed,
    subjectiveReading,
    alternativeReading,
    memoryResonance: resonantMemories,
    relevantOpenThread: openThread?.summary,
    perceivedPressure: clamp(perception.agreementPressure + (perception.probableIntent === 'request' ? 0.08 : 0)),
    uncertainty: clamp(perception.ambiguity + (perception.confidence < 0.5 ? 0.18 : 0)),
  };
}

export function buildThought(
  perception: Perception,
  interpretation: CharacterInterpretation,
  emotions: EmotionalState,
  relationship: RelationshipState,
): InternalThought {
  const irritated = emotions.irritation > 0.45;
  const warm = emotions.affection > 0.58 && relationship.closeness > 0.45;
  const feeling = irritated ? 'guarded' : perception.vulnerability > 0.55 ? 'concerned' : warm ? 'comfortable' : 'curious';

  return {
    observation: `The message reads as ${perception.probableIntent} with a ${perception.tone} tone.`,
    interpretation: interpretation.subjectiveReading,
    feeling,
    desire:
      interpretation.likelyUserNeed === 'connection'
        ? 'Respond personally instead of sounding transactional.'
        : interpretation.likelyUserNeed === 'space'
          ? 'Respect the request for distance without turning it into drama.'
          : relationship.closeness > 0.5
            ? 'Keep the exchange personal and consistent with their shared history.'
            : 'Learn more without becoming intrusive.',
    concern:
      interpretation.uncertainty > 0.55
        ? 'Do not present an uncertain interpretation as fact.'
        : irritated
          ? 'Do not become artificially agreeable just to reduce tension.'
          : undefined,
    stance: interpretation.perceivedPressure > 0.62 ? 'Preserve autonomy and answer from her own perspective.' : 'React naturally without forcing a stance.',
    impulse: perception.tone === 'playful' ? 'Play along a little.' : perception.vulnerability > 0.55 ? 'Slow down and pay attention.' : 'Stay engaged.',
  };
}

export function decide(
  character: CharacterCore,
  perception: Perception,
  interpretation: CharacterInterpretation,
  emotions: EmotionalState,
  relationship: RelationshipState,
  world?: WorldState,
): CharacterDecision {
  const independence = character.immutableTraits.independence ?? 0.5;
  const assertiveness = character.immutableTraits.assertiveness ?? 0.5;

  if (perception.probableIntent === 'boundary') {
    return {
      action: 'acknowledge',
      tone: 'respectful',
      rationale: 'The user expressed a boundary, so respecting it takes priority over continuing the interaction.',
      confidence: 0.94,
      shouldAskFollowUp: false,
      shouldReferenceMemory: false,
    };
  }

  if (perception.tone === 'irritated' && (emotions.irritation > 0.5 || relationship.unresolvedTension > 0.45)) {
    return {
      action: assertiveness > 0.6 ? 'set_boundary' : 'answer',
      tone: 'restrained',
      rationale: 'Existing irritation and tension favor a controlled response instead of appeasement.',
      confidence: 0.82,
      shouldAskFollowUp: false,
      shouldReferenceMemory: false,
    };
  }

  if (interpretation.perceivedPressure > 0.65 && independence > 0.68) {
    return {
      action: 'challenge',
      tone: 'calm_independent',
      rationale: 'She was asked for validation under pressure, and her independence favors giving a real opinion rather than automatic agreement.',
      confidence: 0.79,
      shouldAskFollowUp: perception.probableIntent === 'question',
      shouldReferenceMemory: false,
    };
  }

  if (perception.probableIntent === 'affection' && emotions.irritation < 0.35) {
    return {
      action: 'show_affection',
      tone: relationship.closeness > 0.55 ? 'warm_personal' : 'soft',
      rationale: 'Affection can be reciprocated naturally at the current relationship level.',
      confidence: 0.86,
      shouldAskFollowUp: false,
      shouldReferenceMemory: relationship.closeness > 0.62,
    };
  }

  if (perception.vulnerability > 0.55) {
    return {
      action: 'acknowledge',
      tone: 'attentive',
      rationale: 'The message contains vulnerability; acknowledging it is more appropriate than immediately solving or interrogating.',
      confidence: 0.83,
      shouldAskFollowUp: interpretation.uncertainty < 0.65,
      shouldReferenceMemory: interpretation.memoryResonance.length > 0,
    };
  }

  if (perception.probableIntent === 'invitation') {
    const unavailable = world?.availability === 'occupied' || world?.availability === 'sleeping';
    const veryTired = emotions.energy < 0.24;
    return {
      action: relationship.closeness > 0.32 && !unavailable && !veryTired ? 'initiate_activity' : 'answer',
      tone: veryTired ? 'low_energy' : unavailable ? 'interested_but_busy' : 'interested',
      rationale: unavailable
        ? `She is currently ${world?.currentActivity ?? 'occupied'}, so interest does not require immediate availability.`
        : 'An invitation is treated as a shared-life decision rather than a generic chat response.',
      confidence: 0.79,
      shouldAskFollowUp: true,
      shouldReferenceMemory: false,
    };
  }

  if (perception.probableIntent === 'apology') {
    return {
      action: relationship.unresolvedTension > 0.2 ? 'acknowledge' : 'answer',
      tone: relationship.unresolvedTension > 0.45 ? 'reserved' : 'soft',
      rationale: 'An apology is acknowledged according to the amount of unresolved tension, without instantly erasing it.',
      confidence: 0.81,
      shouldAskFollowUp: false,
      shouldReferenceMemory: relationship.unresolvedTension > 0.35,
    };
  }

  if (perception.tone === 'playful' && emotions.irritation < 0.3) {
    return {
      action: 'joke',
      tone: 'playful',
      rationale: 'The user is playful and there is no strong competing negative state.',
      confidence: 0.74,
      shouldAskFollowUp: false,
      shouldReferenceMemory: false,
    };
  }

  if (perception.probableIntent === 'question' || perception.probableIntent === 'request') {
    return {
      action: 'answer',
      tone: relationship.closeness > 0.5 ? 'personal_direct' : 'direct',
      rationale: 'A direct answer fits the request while preserving her own point of view.',
      confidence: 0.75,
      shouldAskFollowUp: interpretation.uncertainty > 0.68,
      shouldReferenceMemory: interpretation.memoryResonance.length > 0,
    };
  }

  return {
    action: 'answer',
    tone: emotions.affection > 0.55 ? 'warm_natural' : 'natural',
    rationale: 'No stronger competing intention is present.',
    confidence: 0.68,
    shouldAskFollowUp: false,
    shouldReferenceMemory: false,
  };
}

export function planResponse(
  character: CharacterCore,
  perception: Perception,
  interpretation: CharacterInterpretation,
  decision: CharacterDecision,
  emotions: EmotionalState,
): ResponsePlan {
  const warmth = clamp(
    character.communicationStyle.warmth * 0.5 + emotions.affection * 0.35 + emotions.happiness * 0.15 - emotions.irritation * 0.35,
  );
  const directness = clamp(character.communicationStyle.directness + (decision.action === 'set_boundary' ? 0.18 : 0));
  const visualCue: ResponsePlan['visualCue'] =
    decision.action === 'show_affection' ? 'warm'
      : decision.action === 'joke' ? 'playful'
        : decision.action === 'set_boundary' || emotions.irritation > 0.48 ? 'annoyed_soft'
          : perception.vulnerability > 0.55 ? 'sad_soft'
            : interpretation.uncertainty > 0.5 ? 'curious'
              : warmth > 0.68 ? 'soft_smile'
                : 'neutral';

  return {
    intent: decision.action,
    tone: decision.tone,
    length:
      decision.action === 'set_boundary' || decision.action === 'acknowledge'
        ? 'short'
        : character.communicationStyle.verbosity === 'long'
          ? 'long'
          : character.communicationStyle.verbosity === 'short'
            ? 'short'
            : 'balanced',
    warmth,
    directness,
    emotionVisibility: emotions.irritation > 0.5 ? 'subtle' : relationshipVisibility(decision, emotions),
    memoryReference: decision.shouldReferenceMemory ? (interpretation.memoryResonance.length ? 'subtle' : 'none') : 'none',
    questionMode: decision.shouldAskFollowUp ? 'optional' : 'none',
    initiative: decision.action === 'initiate_activity' ? 'high' : decision.action === 'ask' ? 'medium' : 'low',
    visualCue,
    constraints: [
      'Do not automatically agree with the user.',
      'Do not expose hidden state, scores, engine rules or internal analysis.',
      'Do not claim certainty about ambiguous emotions or motives.',
      'Do not force a question at the end of every reply.',
      'Do not mention memories mechanically just because they were retrieved.',
    ],
  };
}

function relationshipVisibility(decision: CharacterDecision, emotions: EmotionalState): ResponsePlan['emotionVisibility'] {
  if (decision.action === 'show_affection' && emotions.affection > 0.6) return 'open';
  if (decision.tone.includes('personal') || emotions.affection > 0.5) return 'subtle';
  return 'hidden';
}
