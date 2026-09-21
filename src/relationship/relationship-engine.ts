import type { RelationshipDelta, RelationshipState } from './relationship-types';

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export const initialRelationshipState: RelationshipState = {
  trust: 0.3,
  closeness: 0.25,
  attachment: 0.18,
  security: 0.35,
  respect: 0.5,
  unresolvedTension: 0,
  stage: 'new',
  updatedAt: Date.now(),
};

function resolveStage(state: RelationshipState): RelationshipState['stage'] {
  const score = state.trust * 0.3 + state.closeness * 0.35 + state.attachment * 0.2 + state.security * 0.15;
  if (score > 0.75) return 'deep';
  if (score > 0.55) return 'close';
  if (score > 0.35) return 'familiar';
  return 'new';
}

export function applyRelationshipDelta(state: RelationshipState, delta: RelationshipDelta, now = Date.now()): RelationshipState {
  const next = { ...state };
  for (const [key, value] of Object.entries(delta)) {
    if (typeof value !== 'number') continue;
    const typedKey = key as keyof RelationshipDelta;
    next[typedKey as keyof RelationshipState] = clamp((next[typedKey as keyof RelationshipState] as number) + value) as never;
  }
  next.stage = resolveStage(next);
  next.updatedAt = now;
  return next;
}
