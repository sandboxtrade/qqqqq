import type { CompanionRepository } from './repositories/interfaces';
import { InMemoryCompanionRepository } from './repositories/in-memory-repository';
import { FirestoreCompanionRepository } from './repositories/firestore-repository';
import { isFirebaseConfigured } from './firebase';

let singleton: CompanionRepository | null = null;

export function getCompanionRepository(characterId: string): CompanionRepository {
  if (!singleton) {
    singleton = isFirebaseConfigured
      ? new FirestoreCompanionRepository(characterId)
      : new InMemoryCompanionRepository();
  }
  return singleton;
}
