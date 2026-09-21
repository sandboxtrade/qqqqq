export type PerceptionIntent =
  | 'question'
  | 'statement'
  | 'request'
  | 'disclosure'
  | 'affection'
  | 'apology'
  | 'disagreement'
  | 'invitation'
  | 'boundary'
  | 'unknown';

export type PerceptionTone =
  | 'neutral'
  | 'warm'
  | 'cold'
  | 'playful'
  | 'irritated'
  | 'sad'
  | 'anxious'
  | 'vulnerable'
  | 'unknown';

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
  source: 'local' | 'gemini';
}

export interface CharacterInterpretation {
  summary: string;
  likelyUserNeed: 'information' | 'connection' | 'reassurance' | 'space' | 'action' | 'play' | 'unknown';
  subjectiveReading: string;
  alternativeReading?: string;
  memoryResonance: string[];
  relevantOpenThread?: string;
  perceivedPressure: number;
  uncertainty: number;
}

export interface InternalThought {
  observation: string;
  interpretation: string;
  feeling: string;
  desire: string;
  concern?: string;
  stance: string;
  impulse: string;
}

export type DecisionAction =
  | 'answer'
  | 'ask'
  | 'refuse'
  | 'agree'
  | 'disagree'
  | 'challenge'
  | 'joke'
  | 'change_topic'
  | 'stay_silent'
  | 'initiate_activity'
  | 'show_affection'
  | 'show_irritation'
  | 'set_boundary'
  | 'acknowledge';

export interface CharacterDecision {
  action: DecisionAction;
  tone: string;
  rationale: string;
  confidence: number;
  shouldAskFollowUp: boolean;
  shouldReferenceMemory: boolean;
}

export interface ResponsePlan {
  intent: DecisionAction;
  tone: string;
  length: 'very_short' | 'short' | 'balanced' | 'long';
  warmth: number;
  directness: number;
  emotionVisibility: 'hidden' | 'subtle' | 'open';
  memoryReference: 'none' | 'subtle' | 'explicit';
  questionMode: 'none' | 'optional' | 'direct';
  initiative: 'low' | 'medium' | 'high';
  visualCue: 'neutral' | 'warm' | 'soft_smile' | 'curious' | 'annoyed_soft' | 'guarded' | 'sad_soft' | 'playful';
  constraints: string[];
}
