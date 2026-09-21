import type { EmotionDelta } from '../emotions/emotion-types';
import type { RelationshipDelta } from '../relationship/relationship-types';
import type { CharacterDecision, Perception } from './cognition-types';

export interface CognitionStateEffects {
  emotion: EmotionDelta;
  relationship: RelationshipDelta;
}

export function inferStateEffects(perception: Perception, decision: CharacterDecision): CognitionStateEffects {
  const emotion: EmotionDelta = { curiosity: 0.005 };
  const relationship: RelationshipDelta = {};

  if (perception.probableIntent === 'affection' || perception.tone === 'warm') {
    emotion.happiness = 0.035;
    emotion.affection = 0.02;
    emotion.irritation = -0.015;
    relationship.closeness = 0.006;
    relationship.trust = 0.003;
  }

  if (perception.probableIntent === 'apology') {
    emotion.irritation = (emotion.irritation ?? 0) - 0.025;
    relationship.unresolvedTension = -0.025;
  }

  if (perception.tone === 'irritated') {
    emotion.irritation = (emotion.irritation ?? 0) + 0.12;
    emotion.happiness = -0.05;
    relationship.security = -0.012;
    relationship.unresolvedTension = 0.035;
  }

  if (perception.probableIntent === 'boundary') {
    relationship.respect = decision.action === 'acknowledge' ? 0.003 : -0.01;
  }

  // Disagreement itself is not a relationship penalty. How it is handled matters more than whether it occurred.
  if (perception.probableIntent === 'disagreement' && perception.tone !== 'irritated') {
    emotion.curiosity = (emotion.curiosity ?? 0) + 0.01;
  }

  return { emotion, relationship };
}
