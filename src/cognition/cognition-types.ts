import type { CharacterViewPosition, CharacterViewReason } from "../memory/model";
import type { IntimacyMindState } from "../intimacy/intimacy";

export type PerceptionIntent =
  | "question"
  | "statement"
  | "request"
  | "disclosure"
  | "affection"
  | "apology"
  | "disagreement"
  | "invitation"
  | "boundary"
  | "unknown";

export type PerceptionTone =
  | "neutral"
  | "warm"
  | "cold"
  | "playful"
  | "irritated"
  | "sad"
  | "anxious"
  | "vulnerable"
  | "unknown";

export interface Perception {
  literalMeaning: string;
  probableIntent: PerceptionIntent;
  tone: PerceptionTone;
  topics: string[];
  emotionalSignals: string[];
  agreementPressure: number;
  vulnerability: number;
  urgency: number;
  ambiguity: number;
  confidence: number;
  source: "local" | "gemini";
}

export interface CharacterInterpretation {
  summary: string;
  likelyUserNeed:
    | "information"
    | "connection"
    | "reassurance"
    | "space"
    | "action"
    | "play"
    | "unknown";
  subjectiveReading: string;
  alternativeReading?: string;
  memoryResonance: string[];
  relevantOpenThread?: string;
  perceivedPressure: number;
  uncertainty: number;
}

export interface ThoughtStimulus {
  userText: string;
  /** Previous user turn, used only for short relationship follow-ups such as "ты ревнуешь?". */
  previousUserText?: string;
  topic?: string;
  focus?: string;
  semanticStance?: string;
  reason?: string;
  sentiment?: string;
  asksCharacterView?: boolean;
  negation?: boolean;
  meaningfulTokens?: number;
  intimacyMind?: IntimacyMindState;
  /** Explicit cause/effect relation grounded in the current or recovered dialogue. */
  causalCause?: string;
  causalEffect?: string;
  causalRelation?: "cause" | "consequence" | "condition" | "motivation" | "temporal_consequence";
  causalConfidence?: number;
  /** Older dialogue was re-read because the fast path could not ground the turn. */
  retrospectiveEcho?: string;
  retrospectiveRecovered?: boolean;
}

export interface InternalThought {
  observation: string;
  interpretation: string;
  feeling: string;
  desire: string;
  concern?: string;
  stance: string;
  impulse: string;
  /** Stable conversational subject used for long-lived self-continuity. */
  topic?: string;
  /** Firestore-safe logical suffix shared by opinion/tension knowledge facts. */
  topicKey?: string;
  position?: CharacterViewPosition;
  positionReason?: CharacterViewReason;
  positionConfidence: number;
  /** How worth preserving this thought is. Ephemeral reactions stay below the persistence threshold. */
  persistence: number;
  /** A remembered prior view that influenced the current thought. */
  memoryEcho?: string;
  /** Why the prior view is being questioned instead of blindly reused. */
  reconsideration?: string;
  /** Direction of repeated counter-evidence; used to make opinion changes gradual. */
  challengeDirection?: "positive" | "negative";
  /** The prior position when a real opinion shift happened this turn. */
  changedFrom?: CharacterViewPosition;
  openQuestion?: string;
  /** Current adult-intimacy cognition, when Adult Mode and context make it relevant. */
  intimacyReflection?: string;
  intimacyDesire?: number;
  intimacyCaution?: number;
  intimacyConflict?: boolean;
  /** Compound relationship emotion derived from durable attachment/security + the current event. */
  relationalEmotion?: "neutral" | "tenderness" | "love" | "jealousy" | "hurt" | "insecurity" | "resentment";
  relationalIntensity?: number;
  relationalReflection?: string;
  relationalThreat?: "none" | "romantic_other" | "comparison" | "betrayal";
  jealousy?: number;
  love?: number;
  hurt?: number;
  causalCause?: string;
  causalEffect?: string;
  causalRelation?: "cause" | "consequence" | "condition" | "motivation" | "temporal_consequence";
  causalConfidence?: number;
  retrospectiveEcho?: string;
  retrospectiveRecovered?: boolean;
}

export type DecisionAction =
  | "answer"
  | "ask"
  | "refuse"
  | "agree"
  | "disagree"
  | "challenge"
  | "joke"
  | "change_topic"
  | "stay_silent"
  | "initiate_activity"
  | "show_affection"
  | "show_irritation"
  | "set_boundary"
  | "acknowledge";

export type ContentMode =
  | "factual"
  | "personal_preference"
  | "personal_stance"
  | "support"
  | "boundary"
  | "refusal"
  | "social"
  | "activity"
  | "clarify"
  | "silence";

export type ContentStance =
  | "neutral"
  | "agree"
  | "disagree"
  | "mixed"
  | "prefer"
  | "avoid"
  | "refuse"
  | "uncertain";

export interface DecisionContent {
  mode: ContentMode;
  stance: ContentStance;
  summary: string;
  reasons: string[];
  locked: boolean;
  provenance: Array<"character_core" | "local_policy" | "conversation" | "none">;
  fallbackText?: string;
  validationKeywords?: string[];
  forbiddenClaims?: string[];
}

export interface CharacterDecision {
  action: DecisionAction;
  tone: string;
  rationale: string;
  confidence: number;
  shouldAskFollowUp: boolean;
  shouldReferenceMemory: boolean;
  content: DecisionContent;
}

export interface ResponsePlan {
  intent: DecisionAction;
  tone: string;
  length: "very_short" | "short" | "balanced" | "long";
  warmth: number;
  directness: number;
  emotionVisibility: "hidden" | "subtle" | "open";
  memoryReference: "none" | "subtle" | "explicit";
  questionMode: "none" | "optional" | "direct";
  initiative: "low" | "medium" | "high";
  visualCue:
    | "neutral"
    | "warm"
    | "soft_smile"
    | "curious"
    | "annoyed_soft"
    | "guarded"
    | "sad_soft"
    | "playful";
  constraints: string[];
}
