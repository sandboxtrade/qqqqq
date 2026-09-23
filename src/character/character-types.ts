export type TraitMap = Record<string, number>;

export interface CharacterPreferenceRule {
  id: string;
  topicKeywords: string[];
  position: string;
  reasons: string[];
  fallbackText: string;
  validationKeywords: string[];
  corePreferenceRefs?: string[];
  strength: number;
}

export interface CharacterCore {
  id: string;
  name: string;
  readonly age: number;
  readonly adult: boolean;
  identityVersion: number;
  immutableTraits: TraitMap;
  slowTraits: TraitMap;
  values: string[];
  preferences: string[];
  dislikes: string[];
  boundaries: string[];
  preferenceRules?: CharacterPreferenceRule[];
  communicationStyle: {
    verbosity: "short" | "balanced" | "long";
    humor: "dry" | "playful" | "soft" | "direct";
    directness: number;
    warmth: number;
  };
}
