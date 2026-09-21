export interface RelationshipState {
  trust: number;
  closeness: number;
  attachment: number;
  security: number;
  respect: number;
  unresolvedTension: number;
  stage: 'new' | 'familiar' | 'close' | 'deep';
  updatedAt: number;
}

export type RelationshipDelta = Partial<Omit<RelationshipState, 'stage' | 'updatedAt'>>;
