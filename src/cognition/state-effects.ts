import type { EmotionDelta, EmotionalState } from "../emotions/emotions";
import { deriveRelationalAffect, type RelationshipDelta, type RelationshipState } from "../relationship/relationship";
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
  currentEmotion?: EmotionalState,
  currentRelationship?: RelationshipState,
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


  // Romance grows from repeated directed signals, but the same compliment
  // should land differently depending on the bond that already exists.
  // A new acquaintance can be flattered; a close, trusted relationship can
  // make an openly suggestive compliment genuinely affect attraction.
  const bond = currentRelationship
    ? Math.max(
        0,
        Math.min(
          1,
          currentRelationship.closeness * 0.34 +
            currentRelationship.trust * 0.26 +
            currentRelationship.attachment * 0.2 +
            currentRelationship.security * 0.12 +
            currentRelationship.respect * 0.08,
        ),
      )
    : 0;
  const suggestiveFlirt = /(?:секси|сексуальн|горяч|соблазн|желан|сводишь\s+меня\s+с\s+ума|не\s+могу\s+отвести.*глаз|шикарн(?:ая|ые)\s+(?:фигура|ноги|талия|губы)|офигенн(?:ая|ые)\s+(?:фигура|ноги|талия|губы))/iu.test(
    perception.literalMeaning,
  );

  if (sourceIntent === "flirt_character") {
    const intensity = suggestiveFlirt ? 1 : 0.72;
    emotion.romanticInterest =
      (emotion.romanticInterest ?? 0) + 0.014 + bond * 0.024 * intensity;
    emotion.affection = (emotion.affection ?? 0) + 0.006 + bond * 0.006;
    emotion.happiness = (emotion.happiness ?? 0) + 0.008 + bond * 0.012 * intensity;
    emotion.curiosity = (emotion.curiosity ?? 0) + 0.004 + bond * 0.008 * intensity;
    relationship.closeness = (relationship.closeness ?? 0) + 0.002 + bond * 0.003;
    if (bond >= 0.55)
      relationship.attachment = (relationship.attachment ?? 0) + 0.0015 + bond * 0.0025;
  } else if (sourceIntent === "affection_declaration") {
    emotion.romanticInterest = (emotion.romanticInterest ?? 0) + 0.014 + bond * 0.012;
    emotion.affection = (emotion.affection ?? 0) + 0.012 + bond * 0.004;
  } else if (sourceIntent === "compliment_character") {
    emotion.romanticInterest = (emotion.romanticInterest ?? 0) + 0.003 + bond * 0.006;
    emotion.happiness = (emotion.happiness ?? 0) + 0.006 + bond * 0.005;
  }

  // Jealousy is an appraisal of a valued bond being threatened, not a global
  // personality toggle. A romantic reference to somebody else matters only if
  // attachment/romantic interest have actually grown. It can make her insecure
  // or hurt without automatically punishing trust or acting possessive.
  if (currentEmotion && currentRelationship) {
    const relational = deriveRelationalAffect(
      currentEmotion,
      currentRelationship,
      perception.literalMeaning,
    );
    if (relational.threat.kind !== "none" && relational.jealousy >= 0.18) {
      const jealousy = relational.jealousy;
      const threat = relational.threat;
      emotion.anxiety = (emotion.anxiety ?? 0) + 0.018 + jealousy * 0.055;
      emotion.sadness = (emotion.sadness ?? 0) + jealousy *
        (threat.kind === "betrayal" ? 0.085 : threat.kind === "comparison" ? 0.055 : 0.028);
      emotion.happiness = (emotion.happiness ?? 0) - jealousy * 0.04;
      relationship.security = (relationship.security ?? 0) -
        jealousy * (threat.kind === "betrayal" ? 0.085 : 0.04);
      relationship.unresolvedTension = (relationship.unresolvedTension ?? 0) +
        jealousy * (threat.kind === "betrayal" ? 0.095 : threat.kind === "comparison" ? 0.052 : 0.022);
      if (threat.kind === "comparison")
        emotion.irritation = (emotion.irritation ?? 0) + jealousy * 0.035;
      if (threat.kind === "betrayal") {
        emotion.irritation = (emotion.irritation ?? 0) + jealousy * 0.075;
        relationship.trust = (relationship.trust ?? 0) - jealousy * 0.06;
        relationship.respect = (relationship.respect ?? 0) - jealousy * 0.025;
      }
    }
  }

  if (perception.probableIntent === "apology") {
    // An apology helps, but it does not erase an emotional bruise in one turn.
    emotion.irritation = (emotion.irritation ?? 0) - 0.035;
    emotion.sadness = (emotion.sadness ?? 0) - 0.015;
    emotion.affection = (emotion.affection ?? 0) + 0.006;
    relationship.unresolvedTension = -0.035;
    relationship.security = (relationship.security ?? 0) + 0.012;
    relationship.trust = (relationship.trust ?? 0) + 0.004;
  }

  if (sourceIntent === "dislike_character") {
    emotion.sadness = (emotion.sadness ?? 0) + 0.08;
    emotion.happiness = (emotion.happiness ?? 0) - 0.055;
    emotion.affection = (emotion.affection ?? 0) - 0.018;
    relationship.security = (relationship.security ?? 0) - 0.026;
    relationship.unresolvedTension = (relationship.unresolvedTension ?? 0) + 0.055;
  }

  if (["joke", "tease_character"].includes(sourceIntent ?? "") && perception.tone === "playful") {
    emotion.happiness = (emotion.happiness ?? 0) + 0.025;
    emotion.curiosity = (emotion.curiosity ?? 0) + 0.008;
    relationship.closeness = (relationship.closeness ?? 0) + 0.002;
  }

  if (
    perception.tone === "irritated" &&
    isPersonalInsultDirectedAtCharacter(perception.literalMeaning)
  ) {
    // Direct attacks can hurt as well as annoy her. Keeping both signals lets
    // later turns feel reserved/sad rather than instantly resetting to anger.
    emotion.irritation = (emotion.irritation ?? 0) + 0.13;
    emotion.sadness = (emotion.sadness ?? 0) + 0.065;
    emotion.happiness = (emotion.happiness ?? 0) - 0.07;
    emotion.affection = (emotion.affection ?? 0) - 0.012;
    relationship.trust = (relationship.trust ?? 0) - 0.018;
    relationship.respect = (relationship.respect ?? 0) - 0.024;
    relationship.security = (relationship.security ?? 0) - 0.03;
    relationship.unresolvedTension = (relationship.unresolvedTension ?? 0) + 0.08;
    // Words from somebody she is attached to land harder than the same insult
    // from a new acquaintance. The extra impact is sadness/security, not only anger.
    if (currentRelationship) {
      const bondSensitivity = Math.max(0, Math.min(1,
        currentRelationship.attachment * 0.46 + currentRelationship.closeness * 0.34 + currentRelationship.trust * 0.2,
      ));
      emotion.sadness = (emotion.sadness ?? 0) + bondSensitivity * 0.045;
      relationship.security = (relationship.security ?? 0) - bondSensitivity * 0.018;
      relationship.unresolvedTension = (relationship.unresolvedTension ?? 0) + bondSensitivity * 0.025;
    }
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

  // Repair continues after the literal apology. Several calm/warm turns slowly
  // rebuild security and let the emotional aftertaste fade instead of snapping
  // instantly from "hurt" to "fine".
  if (currentRelationship && currentRelationship.unresolvedTension > 0.04 &&
      perception.tone === "warm" && perception.probableIntent !== "apology") {
    const repairRoom = Math.min(1, currentRelationship.unresolvedTension * 2.4);
    relationship.unresolvedTension = (relationship.unresolvedTension ?? 0) - 0.008 * repairRoom;
    relationship.security = (relationship.security ?? 0) + 0.004 * repairRoom;
    emotion.irritation = (emotion.irritation ?? 0) - 0.006 * repairRoom;
    emotion.sadness = (emotion.sadness ?? 0) - 0.004 * repairRoom;
  }

  return { emotion, relationship };
}
