import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
  type CollectionReference,
  type DocumentData,
} from 'firebase/firestore';
import type { CompanionRepository, CompanionSnapshot } from './interfaces';
import type { CharacterEvent } from '../../events/event-types';
import type { KnowledgeFact, MemoryRecord, OpenThread } from '../../memory/memory-types';
import type { WorldState } from '../../world/world-types';
import type { CharacterInitiative } from '../../initiative/initiative-types';
import { normalizeKnowledgeFact, normalizeMemoryRecord, normalizeOpenThread } from '../../memory/memory-normalize';
import { getFirebaseDb } from '../firebase';
import { getAuthenticatedUid } from '../auth';


function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as T;
  }

  if (value && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      clean[key] = sanitizeForFirestore(item);
    }
    return clean as T;
  }

  return value;
}

export class FirestoreCompanionRepository implements CompanionRepository {
  constructor(private readonly characterId: string) {}

  private db() {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firebase is not configured.');
    return db;
  }

  private ownerId() {
    const uid = getAuthenticatedUid();
    if (!uid) throw new Error('Firebase authentication is required before accessing companion data.');
    return uid;
  }

  private subcollection(name: string): CollectionReference<DocumentData> {
    return collection(this.db(), 'users', this.ownerId(), 'characters', this.characterId, name);
  }

  private childDoc(collectionName: string, documentId: string) {
    return doc(this.db(), 'users', this.ownerId(), 'characters', this.characterId, collectionName, documentId);
  }

  async appendEvent(event: CharacterEvent) {
    await setDoc(this.childDoc('events', event.id), sanitizeForFirestore(event));
  }

  async listRecentEvents(max = 30) {
    const q = query(this.subcollection('events'), orderBy('timestamp', 'desc'), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as CharacterEvent).reverse();
  }

  async isEventConsolidated(eventId: string) {
    const snapshot = await getDoc(this.childDoc('memoryProcessed', eventId));
    return snapshot.exists();
  }

  async markEventConsolidated(eventId: string, timestamp: number) {
    await setDoc(this.childDoc('memoryProcessed', eventId), sanitizeForFirestore({ eventId, timestamp }));
  }

  async loadSnapshot(): Promise<CompanionSnapshot | null> {
    const snapshot = await getDoc(this.childDoc('state', 'current'));
    return snapshot.exists() ? (snapshot.data() as CompanionSnapshot) : null;
  }

  async saveSnapshot(snapshot: CompanionSnapshot) {
    await setDoc(this.childDoc('state', 'current'), sanitizeForFirestore(snapshot), { merge: true });
  }

  async loadWorldState(): Promise<WorldState | null> {
    const snapshot = await getDoc(this.childDoc('world', 'current'));
    return snapshot.exists() ? (snapshot.data() as WorldState) : null;
  }

  async saveWorldState(world: WorldState) {
    await setDoc(this.childDoc('world', 'current'), sanitizeForFirestore(world), { merge: true });
  }

  async listInitiatives(options?: { limit?: number }) {
    const max = options?.limit ?? 300;
    const q = query(this.subcollection('initiatives'), orderBy('createdAt', 'desc'), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as CharacterInitiative);
  }

  async saveInitiative(initiative: CharacterInitiative) {
    await setDoc(this.childDoc('initiatives', initiative.id), sanitizeForFirestore(initiative));
  }

  async listMemories(options?: { includeArchived?: boolean; limit?: number }) {
    const includeArchived = options?.includeArchived ?? false;
    const max = options?.limit ?? 600;
    const ref = this.subcollection('memories');
    const q = includeArchived ? query(ref, limit(max)) : query(ref, where('status', '==', 'active'), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => normalizeMemoryRecord(d.data() as MemoryRecord));
  }

  async saveMemory(memory: MemoryRecord) {
    await setDoc(this.childDoc('memories', memory.id), sanitizeForFirestore(memory));
  }

  async listKnowledgeFacts() {
    const snapshot = await getDocs(this.subcollection('knowledge'));
    return snapshot.docs.map((d) => normalizeKnowledgeFact(d.data() as KnowledgeFact));
  }

  async saveKnowledgeFact(fact: KnowledgeFact) {
    await setDoc(this.childDoc('knowledge', fact.id), sanitizeForFirestore(fact));
  }

  async listOpenThreads() {
    const snapshot = await getDocs(this.subcollection('openThreads'));
    return snapshot.docs.map((d) => normalizeOpenThread(d.data() as OpenThread));
  }

  async saveOpenThread(thread: OpenThread) {
    await setDoc(this.childDoc('openThreads', thread.id), sanitizeForFirestore(thread));
  }
}
