import type { CharacterCore } from "../character/character";
import type { CharacterDecision, Perception, ResponsePlan } from "../cognition/cognition-types";
import type { EmotionalState } from "../emotions/emotions";
import type { CharacterInitiative } from "../initiative/initiative";
import type { MemoryContext } from "../memory/model";
import type { RelationshipState } from "../relationship/relationship";
import type { RomanceState } from "../relationship/relationship";
import type { WorldState } from "../world/world";

export type LocalSentiment =
  | "very_negative"
  | "negative"
  | "neutral"
  | "positive"
  | "very_positive";

export type LocalQuestionType =
  | "yes_no"
  | "what"
  | "why"
  | "how"
  | "where"
  | "when"
  | "who"
  | "choice";

export interface ExtractedEntity {
  type: "person" | "place" | "time" | "work" | "number" | "topic";
  value: string;
  normalized: string;
  confidence: number;
}

export type SemanticSubject = "user" | "character" | "other" | "shared" | "unknown";
export type SemanticStance =
  | "want"
  | "avoid"
  | "like"
  | "dislike"
  | "believe"
  | "feel"
  | "plan"
  | "change_mind"
  | "ask_opinion"
  | "ask_fact"
  | "request"
  | "react"
  | "neutral";

export interface LocalSemanticFrame {
  subject: SemanticSubject;
  stance: SemanticStance;
  /** Human-readable core of the utterance, kept short enough to safely mirror in a reply. */
  focus?: string;
  /** Explicit cause/reason supplied by the user (not inferred by the engine). */
  reason?: string;
  /** A contrasted alternative explicitly supplied by the user ("не X, а лучше Y"). */
  alternative?: string;
  /** "Not X, but Y" style correction. */
  correctionFrom?: string;
  correctionTo?: string;
  hypothetical: boolean;
  wantsAdvice: boolean;
  wantsListening: boolean;
  asksCharacterView: boolean;
  reciprocal: boolean;
  meaningfulTokens: number;
}

export interface LocalNLUResult {
  intent: string;
  secondaryIntents: string[];
  topic?: string;
  sentiment: LocalSentiment;
  questionType?: LocalQuestionType;
  isQuestion: boolean;
  negation: boolean;
  intensity: number;
  entities: ExtractedEntity[];
  matchedConcepts: string[];
  semantic: LocalSemanticFrame;
  confidence: number;
}

export type DialogueAct =
  | "ACKNOWLEDGE"
  | "ANSWER"
  | "AGREE"
  | "DISAGREE"
  | "REASSURE"
  | "CARE"
  | "COMFORT"
  | "SUGGEST_REST"
  | "TEASE"
  | "FLIRT"
  | "JOKE"
  | "ASK"
  | "FOLLOW_UP"
  | "REMEMBER"
  | "REFER_MEMORY"
  | "SURPRISE"
  | "HAPPINESS"
  | "SADNESS"
  | "JEALOUSY"
  | "CURIOSITY"
  | "APOLOGY"
  | "GRATITUDE"
  | "BOUNDARY"
  | "REFUSE"
  | "CHANGE_TOPIC"
  | "SILENCE"
  | "GOOD_MORNING"
  | "GOOD_NIGHT"
  | "WELCOME_BACK"
  | "MISS_USER"
  | "CONTINUE_TOPIC"
  | "CLARIFY"
  | "SHARE";

export type DialogueGoal =
  | "support"
  | "answer"
  | "tease"
  | "comfort"
  | "ask"
  | "continue_topic"
  | "set_boundary"
  | "share"
  | "react"
  | "refuse"
  | "silence";

export type DialogueTrigger =
  | "USER_MESSAGE"
  | "AUTONOMOUS_MESSAGE"
  | "WELCOME_BACK"
  | "LONG_ABSENCE"
  | "RELATIONSHIP_EVENT"
  | "MOOD_EVENT"
  | "MEMORY_TRIGGER"
  | "TIME_EVENT";

export type LocalResponseLength = "very_short" | "short" | "medium" | "long";

export interface CharacterResponsePlan {
  trigger: DialogueTrigger;
  sourceIntent: string;
  dialogueActs: DialogueAct[];
  goal: DialogueGoal;
  emotion: string;
  emotionIntensity: number;
  tone: string[];
  relationshipLevel: RelationshipState["stage"];
  intimacyLevel?: number;
  energy: number;
  responseLength: LocalResponseLength;
  shouldAskQuestion: boolean;
  topic?: string;
  semanticPayload?: Record<string, string | number | boolean | null | undefined>;
  decision: CharacterDecision;
  responsePlan: ResponsePlan;
}

export interface DialogueFrame {
  currentTopic?: string;
  previousTopic?: string;
  lastUserIntent?: string;
  lastCharacterIntent?: string;
  pendingQuestion?: string;
  referencedEntities: string[];
  turnsOnTopic: number;
  previousUserText?: string;
  previousCharacterText?: string;
}

export interface DialogueHistoryLine {
  id?: string;
  role: "user" | "character";
  text: string;
  timestamp: number;
  templateId?: string;
  dialogueActs?: DialogueAct[];
}

export interface DialogueContext {
  userText?: string;
  turnId: string;
  now: number;
  character: CharacterCore;
  emotion: EmotionalState;
  relationship: RelationshipState;
  world: WorldState;
  romance?: RomanceState;
  memoryContext: MemoryContext;
  history: DialogueHistoryLine[];
  nlu: LocalNLUResult;
  perception: Perception;
  decision: CharacterDecision;
  responsePlan: ResponsePlan;
  dialogueFrame: DialogueFrame;
  initiative?: CharacterInitiative;
}

export interface RejectedTemplate {
  id: string;
  reason: string;
}

export interface RenderDebug {
  detectedIntent: string;
  confidence: number;
  concepts: string[];
  selectedActs: DialogueAct[];
  selectedTemplate: string;
  rejectedTemplates: RejectedTemplate[];
  relationshipBand: RelationshipState["stage"];
  emotion: string;
  fallbackLevel: number;
  similarityScore: number;
  languagePackIssues: string[];
}

export interface RenderedResponse {
  text: string;
  templateId: string;
  openingPhrase?: string;
  dialogueActs: DialogueAct[];
  fallbackLevel: number;
  debug: RenderDebug;
}

export interface ResponseRenderer {
  render(
    plan: CharacterResponsePlan,
    context: DialogueContext,
  ): Promise<RenderedResponse>;
}

export interface IntentDefinition {
  id: string;
  priority: number;
  topic?: string;
  patterns: {
    phrases: string[];
    tokens: string[];
    regex: string[];
  };
  negativePatterns: string[];
  concepts: string[];
  sentiment?: LocalSentiment;
}

export interface ConceptDefinition {
  id: string;
  tokens: string[];
  phrases: string[];
  topic?: string;
  sentiment?: LocalSentiment;
}

export interface TemplateConditions {
  intents?: string[];
  actsAny?: DialogueAct[];
  actsAll?: DialogueAct[];
  tones?: string[];
  relationship?: RelationshipState["stage"][];
  conceptsAny?: string[];
  questionTypes?: LocalQuestionType[];
  minConfidence?: number;
  maxConfidence?: number;
  memoryRequired?: boolean;
  initiativeKinds?: string[];
}

export interface DialogueTemplate {
  id: string;
  conditions: TemplateConditions;
  weight: number;
  cooldownTurns: number;
  variants: string[];
}

export interface ReactionFragment {
  id: string;
  act: DialogueAct;
  variants: string[];
  tones?: string[];
  relationship?: RelationshipState["stage"][];
  intents?: string[];
  conceptsAny?: string[];
  weight: number;
  cooldownTurns: number;
}

export interface LanguagePack {
  intents: IntentDefinition[];
  concepts: ConceptDefinition[];
  templates: DialogueTemplate[];
  reactions: ReactionFragment[];
  fallbacks: Record<string, string[]>;
  connectors: Record<string, string[]>;
  vocabulary: Record<string, Record<string, string[]>>;
  topics: Record<string, { tokens: string[]; phrases: string[] }>;
  issues: string[];
}
