import type { EmotionDelta } from "../emotions/emotions";
import type { RelationshipDelta } from "../relationship/relationship";
import type { CharacterDecision, Perception } from "./cognition-types";
import { isPersonalInsultDirectedAtCharacter } from "./local-cognition";

export interface CognitionStateEffects {
  emotion: EmotionDelta;
  relationship: RelationshipDelta;
}

export function inferStateEffects(
  perception: Perception,
  decision: CharacterDecision,
  sourceIntent?: string,
): CognitionStateEffects {
  const emotion: EmotionDelta = { curiosity: 0.005 };
  const relationship: RelationshipDelta = {};

  // Ordinary respectful conversation can slowly turn an acquaintance into a
  // real friend. This is intentionally tiny; closeness should come from time
  // and repeated interaction rather than from a single message.
  const relationallySafe =
    perception.tone !== "irritated" &&
    perception.probableIntent !== "boundary" &&
    !["refuse", "set_boundary", "show_irritation"].includes(decision.action);
  if (relationallySafe) {
    relationship.trust = 0.0008;
    relationship.closeness = 0.0007;
    relationship.security = 0.0006;
  }

  if (perception.probableIntent === "affection" || perception.tone === "warm") {
    emotion.happiness = 0.035;
    emotion.affection = 0.02;
    emotion.irritation = -0.015;
    relationship.closeness = (relationship.closeness ?? 0) + 0.008;
    relationship.trust = (relationship.trust ?? 0) + 0.004;
    relationship.attachment = 0.005;
    relationship.security = (relationship.security ?? 0) + 0.003;
    relationship.unresolvedTension = -0.003;
  }


  // Romance is not part of the starting relationship. It grows only from
  // repeated, directed romantic signals. A generic compliment barely moves it;
  // explicit flirting/affection moves it more, but still cannot jump stages.
  if (sourceIntent === "flirt_character") {
    emotion.romanticInterest = (emotion.romanticInterest ?? 0) + 0.02;
    emotion.affection = (emotion.affection ?? 0) + 0.008;
  } else if (sourceIntent === "affection_declaration") {
    emotion.romanticInterest = (emotion.romanticInterest ?? 0) + 0.016;
    emotion.affection = (emotion.affection ?? 0) + 0.012;
  } else if (sourceIntent === "compliment_character") {
    emotion.romanticInterest = (emotion.romanticInterest ?? 0) + 0.004;
  }

  if (perception.probableIntent === "apology") {
    emotion.irritation = (emotion.irritation ?? 0) - 0.025;
    relationship.unresolvedTension = -0.025;
    relationship.security = (relationship.security ?? 0) + 0.01;
    relationship.trust = (relationship.trust ?? 0) + 0.002;
  }

  if (
    perception.tone === "irritated" &&
    isPersonalInsultDirectedAtCharacter(perception.literalMeaning)
  ) {
    emotion.irritation = (emotion.irritation ?? 0) + 0.12;
    emotion.happiness = -0.05;
    relationship.security = -0.012;
    relationship.unresolvedTension = 0.035;
  }

  if (perception.probableIntent === "boundary") {
    relationship.respect =
      decision.action === "acknowledge" || decision.action === "stay_silent"
        ? 0.003
        : -0.01;
  }

  // Disagreement itself is not a relationship penalty. How it is handled matters more than whether it occurred.
  if (
    perception.probableIntent === "disagreement" &&
    perception.tone !== "irritated"
  ) {
    emotion.curiosity = (emotion.curiosity ?? 0) + 0.01;
  }

  return { emotion, relationship };
}
