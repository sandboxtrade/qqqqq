export type TraitMap = Record<string, number>;

export interface CharacterCore {
  id: string;
  name: string;
  age: number;
  identityVersion: number;
  immutableTraits: TraitMap;
  slowTraits: TraitMap;
  values: string[];
  preferences: string[];
  dislikes: string[];
  boundaries: string[];
  communicationStyle: {
    verbosity: 'short' | 'balanced' | 'long';
    humor: 'dry' | 'playful' | 'soft' | 'direct';
    directness: number;
    warmth: number;
  };
}
