export interface EmotionalState {
  mood: number;
  energy: number;
  happiness: number;
  irritation: number;
  sadness: number;
  anxiety: number;
  curiosity: number;
  boredom: number;
  affection: number;
  romanticInterest: number;
  updatedAt: number;
}

export type EmotionDelta = Partial<Omit<EmotionalState, 'updatedAt'>>;
