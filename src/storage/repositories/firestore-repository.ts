import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  runTransaction,
  writeBatch,
  where,
  type CollectionReference,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import type {
  CompanionRepository,
  CompanionSnapshot,
  RuntimePersistenceState,
  MemoryRecoveryState,
  ConversationPage,
  KnowledgeMergeResult,
} from "./interfaces";
import type { CharacterEvent } from "../../events/event-types";
import type {
  KnowledgeFact,
  MemoryRecord,
  OpenThread,
} from "../../memory/model";
import type { WorldState } from "../../world/world";
import type { CharacterInitiative } from "../../initiative/initiative";
import { reinforceMemory } from "../../memory/model";
import type { IntimacyPreferencesDocument, IntimacyState } from "../../intimacy/intimacy";
import { getFirebaseDb } from "../firebase";
import type { YuzukiEditableContext, YuzukiEditableContextPatch } from "../../context/yuzuki-context";
import { createDefaultEditableContext, decodeEditableContext, encodeEditableContext, normalizeEditableContext } from "../../context/yuzuki-context";
import { getAuthenticatedUid } from "../auth";
import { sanitizeForFirestore } from "../firestore-data";
import {
  decodeCharacterEvent,
  decodeCompanionSnapshot,
  decodeInitiative,
  decodeIntimacyPreferences,
  decodeIntimacyState,
  decodeKnowledgeFact,
  decodeMemoryPendingMarker,
  decodeTurnPendingMarker,
  decodeMemoryProcessedMarker,
  decodeMemoryRecord,
  decodeMemoryRecoveryState,
  decodeOpenThread,
  decodeWorldState,
  encodeCompanionSnapshot,
  encodeInitiative,
  encodeIntimacyPreferences,
  encodeIntimacyState,
  encodeKnowledgeFact,
  encodeMemoryPendingMarker,
  encodeTurnPendingMarker,
  encodeMemoryProcessedMarker,
  encodeMemoryRecord,
  encodeMemoryRecoveryState,
  encodeOpenThread,
  encodeWorldState,
  MEMORY_PROCESSOR_VERSION,
} from "../persistence-schema";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function sameImmutableEvent(a: CharacterEvent, b: CharacterEvent) {
  const comparable = (event: CharacterEvent) => ({
    id: event.id,
    type: event.type,
    source: event.source,
    timestamp: event.timestamp,
    payload: event.payload,
    importance: event.importance,
  });
  return (
    JSON.stringify(canonical(comparable(a))) ===
    JSON.stringify(canonical(comparable(b)))
  );
}

function knowledgeHeadId(key: string) {
  return encodeURIComponent(key).replace(/%/g, "~");
}

function compareFactRecency(a: KnowledgeFact, b: KnowledgeFact) {
  return a.lastConfirmedAt - b.lastConfirmedAt || a.id.localeCompare(b.id);
}

function sameFactValue(a: KnowledgeFact, b: KnowledgeFact) {
  return a.value.trim().toLowerCase() === b.value.trim().toLowerCase();
}

function currentFactOutranksCandidate(current: KnowledgeFact, candidate: KnowledgeFact) {
  if (current.lastConfirmedAt !== candidate.lastConfirmedAt)
    return current.lastConfirmedAt > candidate.lastConfirmedAt;
  const sameEvidence = candidate.sourceEventIds.some((id) =>
    current.sourceEventIds.includes(id),
  );
  // Multiple facts extracted from one immutable message are intentionally
  // processed in source order, so the later candidate wins an exact-time tie.
  if (sameEvidence) return false;
  return current.id.localeCompare(candidate.id) > 0;
}

function validateTurnEvents(events: CharacterEvent[]) {
  if (events.length < 2)
    throw new Error("Некорректный turn: отсутствует пара user/character.");
  const ids = new Set(events.map((event) => event.id));
  if (ids.size !== events.length)
    throw new Error("Некорректный turn: повторяющийся event id.");
  const user = events[0];
  const reply = events[1];
  if (user.type !== "message" || user.source !== "user")
    throw new Error("Некорректный turn: первое событие должно быть user message.");
  if (reply.type !== "message" || reply.source !== "character")
    throw new Error(
      "Некорректный turn: второе событие должно быть character reply.",
    );
  const inReplyTo = String(
    (reply.payload as { inReplyTo?: unknown } | null)?.inReplyTo ?? "",
  );
  if (inReplyTo !== user.id)
    throw new Error("Некорректный turn: reply не связан с user event.");
}

export class FirestoreCompanionRepository implements CompanionRepository {
  constructor(
    private readonly characterId: string,
    private readonly uid: string,
    private readonly guard: () => void = () => {},
  ) {}

  private db() {
    const db = getFirebaseDb();
    if (!db) throw new Error("Firebase is not configured.");
    return db;
  }

  private ownerId() {
    this.guard();
    if (getAuthenticatedUid() !== this.uid)
      throw new Error("Сеанс изменился. Открой чат заново.");
    return this.uid;
  }

  private subcollection(name: string): CollectionReference<DocumentData> {
    return collection(
      this.db(),
      "users",
      this.ownerId(),
      "characters",
      this.characterId,
      name,
    );
  }

  private childDoc(collectionName: string, documentId: string) {
    return doc(
      this.db(),
      "users",
      this.ownerId(),
      "characters",
      this.characterId,
      collectionName,
      documentId,
    );
  }

  async getEvent(id: string) {
    const snap = await getDoc(this.childDoc("events", id));
    return snap.exists() ? decodeCharacterEvent(snap.data(), id) : null;
  }

  async appendEvent(event: CharacterEvent) {
    const ref = this.childDoc("events", event.id);
    const turnPendingRef =
      event.type === "message" && event.source === "user"
        ? this.childDoc("turnPending", event.id)
        : null;
    await runTransaction(this.db(), async (tx) => {
      const existing = await tx.get(ref);
      this.ownerId();
      if (!existing.exists()) {
        tx.set(ref, sanitizeForFirestore(event));
        if (turnPendingRef)
          tx.set(
            turnPendingRef,
            sanitizeForFirestore(encodeTurnPendingMarker(event.id, event.timestamp)),
          );
        return;
      }
      if (!sameImmutableEvent(decodeCharacterEvent(existing.data(), event.id), event))
        throw new Error(`event-id-collision:${event.id}`);
      // A retry of the same immutable user event re-opens recovery if a
      // previous local "skip" or interrupted cleanup removed the marker.
      if (turnPendingRef)
        tx.set(
          turnPendingRef,
          sanitizeForFirestore(encodeTurnPendingMarker(event.id, event.timestamp)),
        );
    });
  }

  async listPendingTurns(max = 100) {
    const pending = await getDocs(
      query(
        this.subcollection("turnPending"),
        orderBy("timestamp", "asc"),
        limit(Math.max(1, Math.min(max, 200))),
      ),
    );
    const markers = pending.docs.map((d) =>
      decodeTurnPendingMarker(d.data(), d.id),
    );
    const events = await Promise.all(
      markers.map(async (marker) => {
        const [event, reply] = await Promise.all([
          getDoc(this.childDoc("events", marker.messageId)),
          getDoc(this.childDoc("events", `reply_${marker.messageId}`)),
        ]);
        if (reply.exists() || !event.exists()) return null;
        const decoded = decodeCharacterEvent(event.data(), marker.messageId);
        return decoded.type === "message" && decoded.source === "user"
          ? decoded
          : null;
      }),
    );
    return events.filter((event): event is CharacterEvent => event !== null);
  }

  async dismissPendingTurn(messageId: string) {
    const ref = this.childDoc("turnPending", messageId);
    await runTransaction(this.db(), async (tx) => {
      this.ownerId();
      tx.delete(ref);
    });
  }

  async commitTurn(
    events: CharacterEvent[],
    snapshot: CompanionSnapshot,
    world: WorldState,
    expectedRevision: number,
  ) {
    validateTurnEvents(events);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error("Некорректная revision состояния.");

    const stateRef = this.childDoc("state", "current");
    const worldRef = this.childDoc("world", "current");
    const refs = events.map((event) => this.childDoc("events", event.id));
    const turnPendingRef = this.childDoc("turnPending", events[0].id);

    await runTransaction(this.db(), async (tx) => {
      const [state, storedWorld, ...existing] = await Promise.all([
        tx.get(stateRef),
        tx.get(worldRef),
        ...refs.map((ref) => tx.get(ref)),
      ]);
      this.ownerId();

      if (existing[1]?.exists()) {
        const savedReply = decodeCharacterEvent(existing[1].data(), events[1].id);
        const savedInReplyTo = String(
          (savedReply.payload as { inReplyTo?: unknown } | null)?.inReplyTo ?? "",
        );
        if (
          savedReply.type === "message" &&
          savedReply.source === "character" &&
          savedInReplyTo === events[0].id
        )
          throw new Error("turn-already-committed");
        throw new Error(`event-id-collision:${events[1].id}`);
      }

      for (let i = 0; i < existing.length; i++) {
        if (
          existing[i].exists() &&
          !sameImmutableEvent(decodeCharacterEvent(existing[i].data(), events[i].id), events[i])
        ) {
          throw new Error(`event-id-collision:${events[i].id}`);
        }
      }

      const persistedSnapshot = state.exists()
        ? decodeCompanionSnapshot(state.data())
        : null;
      const persistedRevision = persistedSnapshot?.revision ?? 0;
      const worldRevision = storedWorld.exists()
        ? decodeWorldState(storedWorld.data()).revision
        : undefined;

      if (
        worldRevision !== undefined &&
        Number.isSafeInteger(worldRevision) &&
        worldRevision !== persistedRevision
      ) {
        throw new Error(
          "Состояние мира и персонажа рассинхронизировано. [state-world-conflict]",
        );
      }

      if (persistedRevision !== expectedRevision)
        throw new Error(
          "Состояние обновилось в другом окне. Повтори отправку. [state-conflict]",
        );

      events.forEach((event, i) => {
        if (!existing[i].exists()) {
          tx.set(refs[i], sanitizeForFirestore(event));
        }
      });
      // A completed turn and its "pending" marker move atomically. If this
      // transaction fails, the marker remains recoverable on the next launch.
      tx.delete(turnPendingRef);

      const nextRevision = expectedRevision + 1;
      tx.set(
        stateRef,
        sanitizeForFirestore(encodeCompanionSnapshot({ ...snapshot, revision: nextRevision })),
      );
      tx.set(
        worldRef,
        sanitizeForFirestore(encodeWorldState(world, nextRevision)),
      );
    });
  }

  async listRecentEvents(max = 30) {
    const q = query(
      this.subcollection("events"),
      orderBy("timestamp", "desc"),
      limit(max),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => decodeCharacterEvent(d.data(), d.id)).reverse();
  }

  async listConversationEvents(options?: {
    before?: { timestamp: number; id: string } | null;
    limit?: number;
  }): Promise<ConversationPage> {
    const target = Math.max(1, Math.min(options?.limit ?? 80, 120));
    const collected: CharacterEvent[] = [];
    let cursor = options?.before ?? null;
    let exhausted = false;

    // Filter to conversation event types in Firestore before applying the page
    // limit. Long-running world simulation can otherwise force pagination to
    // scan thousands of unrelated records between two chat messages.
    while (collected.length < target + 1 && !exhausted) {
      const batchSize = Math.max(20, Math.min(100, target + 1 - collected.length));
      const constraints: QueryConstraint[] = [
        where("type", "in", ["message", "character_action"]),
        orderBy("timestamp", "desc"),
        orderBy(documentId(), "desc"),
      ];
      if (cursor) constraints.push(startAfter(cursor.timestamp, cursor.id));
      constraints.push(limit(batchSize));
      const snapshot = await getDocs(
        query(this.subcollection("events"), ...constraints),
      );
      if (!snapshot.docs.length) {
        exhausted = true;
        break;
      }

      for (const item of snapshot.docs) {
        const event = decodeCharacterEvent(item.data(), item.id);
        cursor = { timestamp: event.timestamp, id: event.id };
        if (event.source !== "system") collected.push(event);
        if (collected.length >= target + 1) break;
      }
      if (snapshot.docs.length < batchSize) exhausted = true;
    }

    const page = collected.slice(0, target);
    const oldest = page.at(-1);
    const foundExtraConversation = collected.length > target;
    return {
      events: page.reverse(),
      nextCursor: foundExtraConversation && oldest
        ? { timestamp: oldest.timestamp, id: oldest.id }
        : cursor ?? options?.before ?? null,
      hasMore: foundExtraConversation || !exhausted,
    };
  }

  async listEventsForMemoryBackfill(options?: {
    after?: { timestamp: number; id: string } | null;
    limit?: number;
  }) {
    const max = options?.limit ?? 120;
    const after = options?.after ?? null;
    const constraints: QueryConstraint[] = [
      orderBy("timestamp", "asc"),
      orderBy(documentId(), "asc"),
    ];
    if (after) constraints.push(startAfter(after.timestamp, after.id));
    constraints.push(limit(max));
    const snapshot = await getDocs(
      query(this.subcollection("events"), ...constraints),
    );
    return snapshot.docs.map((d) => decodeCharacterEvent(d.data(), d.id));
  }

  async listPendingMemoryEvents(max = 120) {
    const pending = await getDocs(
      query(
        this.subcollection("memoryPending"),
        orderBy("timestamp", "asc"),
        limit(max),
      ),
    );
    const markers = pending.docs.map((d) =>
      decodeMemoryPendingMarker(d.data(), d.id),
    );
    const events = await Promise.all(
      markers.map(async (marker) => {
        const event = await getDoc(this.childDoc("events", marker.eventId));
        return event.exists()
          ? decodeCharacterEvent(event.data(), marker.eventId)
          : null;
      }),
    );
    return events.filter((event): event is CharacterEvent => event !== null);
  }

  async loadMemoryRecoveryState() {
    const snapshot = await getDoc(this.childDoc("memoryMeta", "recovery"));
    return snapshot.exists() ? decodeMemoryRecoveryState(snapshot.data()) : null;
  }

  async saveMemoryRecoveryState(state: MemoryRecoveryState) {
    await setDoc(
      this.childDoc("memoryMeta", "recovery"),
      sanitizeForFirestore(encodeMemoryRecoveryState(state)),
    );
  }

  async listConsolidatedEventIds(since: number) {
    const snapshot = await getDocs(
      query(
        this.subcollection("memoryProcessed"),
        where("timestamp", ">=", since),
      ),
    );
    return snapshot.docs
      .filter((d) =>
        decodeMemoryProcessedMarker(d.data(), d.id).processorVersion ===
        MEMORY_PROCESSOR_VERSION,
      )
      .map((d) => d.id);
  }

  async isEventConsolidated(eventId: string) {
    const snapshot = await getDoc(this.childDoc("memoryProcessed", eventId));
    return (
      snapshot.exists() &&
      decodeMemoryProcessedMarker(snapshot.data(), eventId).processorVersion ===
        MEMORY_PROCESSOR_VERSION
    );
  }

  async markEventConsolidated(eventId: string, timestamp: number) {
    const processedRef = this.childDoc("memoryProcessed", eventId);
    const pendingRef = this.childDoc("memoryPending", eventId);
    await runTransaction(this.db(), async (tx) => {
      tx.set(
        processedRef,
        sanitizeForFirestore(encodeMemoryProcessedMarker(eventId, timestamp)),
      );
      tx.delete(pendingRef);
    });
  }

  async loadRuntimeState(): Promise<RuntimePersistenceState> {
    const stateRef = this.childDoc("state", "current");
    const worldRef = this.childDoc("world", "current");

    return runTransaction(this.db(), async (tx) => {
      const [stateSnap, worldSnap] = await Promise.all([
        tx.get(stateRef),
        tx.get(worldRef),
      ]);
      this.ownerId();

      const snapshot = stateSnap.exists()
        ? decodeCompanionSnapshot(stateSnap.data())
        : null;
      if (!worldSnap.exists()) return { snapshot, world: null };

      const { world, revision: worldRevision } = decodeWorldState(
        worldSnap.data(),
      );
      const stateRevision = snapshot?.revision;
      if (
        snapshot &&
        stateRevision !== undefined &&
        worldRevision !== undefined &&
        stateRevision !== worldRevision
      ) {
        // Older tabs / interrupted historical builds could leave the two
        // documents one revision apart. Bricking the whole app on read makes
        // chat and the recovery/reset controls unusable. Preserve the actual
        // payloads and repair only the revision marker atomically.
        const repairedRevision = Math.max(stateRevision, worldRevision);
        if (stateRevision !== repairedRevision) {
          tx.set(
            stateRef,
            sanitizeForFirestore(
              encodeCompanionSnapshot({ ...snapshot, revision: repairedRevision }),
            ),
          );
        }
        if (worldRevision !== repairedRevision) {
          tx.set(
            worldRef,
            sanitizeForFirestore(encodeWorldState(world, repairedRevision)),
          );
        }
        return {
          snapshot: { ...snapshot, revision: repairedRevision },
          world,
        };
      }
      return { snapshot, world };
    });
  }

  async loadSnapshot(): Promise<CompanionSnapshot | null> {
    return (await this.loadRuntimeState()).snapshot;
  }

  async loadWorldState(): Promise<WorldState | null> {
    return (await this.loadRuntimeState()).world;
  }

  async loadEditableContext(): Promise<YuzukiEditableContext | null> {
    const snapshot = await getDoc(this.childDoc("manualContext", "current"));
    return snapshot.exists() ? decodeEditableContext(snapshot.data()) : null;
  }

  async saveEditableContext(context: YuzukiEditableContext): Promise<YuzukiEditableContext> {
    const normalized = normalizeEditableContext(context, Date.now());
    const ref = this.childDoc("manualContext", "current");
    await setDoc(ref, sanitizeForFirestore(encodeEditableContext(normalized)));
    return normalized;
  }

  async updateEditableContext(patch: YuzukiEditableContextPatch): Promise<YuzukiEditableContext> {
    const ref = this.childDoc("manualContext", "current");
    return runTransaction(this.db(), async (tx) => {
      const snapshot = await tx.get(ref);
      this.ownerId();
      const now = Date.now();
      const current = snapshot.exists()
        ? decodeEditableContext(snapshot.data()) ?? createDefaultEditableContext(now)
        : createDefaultEditableContext(now);
      const normalized = normalizeEditableContext({
        ...current,
        ...patch,
        updatedAt: Math.max(current.updatedAt, patch.updatedAt ?? 0, now),
      }, now);
      tx.set(ref, sanitizeForFirestore(encodeEditableContext(normalized)));
      return normalized;
    });
  }

  async resetConversationAndMemory(
    snapshot: CompanionSnapshot,
    world: WorldState,
  ): Promise<RuntimePersistenceState> {
    const editableContext = await this.loadEditableContext();
    const resetCollections = [
      "events",
      "memoryPending",
      "memoryProcessed",
      "memoryMeta",
      "turnPending",
      "memories",
      "knowledge",
      "knowledgeHeads",
      "openThreads",
      "initiatives",
      "intimacy",
    ] as const;

    // Capture the current generation first. Anything written after the reset
    // revision is published is new data and must not be removed by this reset.
    const snapshots = await Promise.all(
      resetCollections.map(async (name) => ({
        name,
        docs: (await getDocs(this.subcollection(name))).docs.map((item) => item.id),
      })),
    );
    this.ownerId();

    const stateRef = this.childDoc("state", "current");
    const worldRef = this.childDoc("world", "current");
    let resetRevision = 0;
    await runTransaction(this.db(), async (tx) => {
      const [stateSnap, worldSnap] = await Promise.all([
        tx.get(stateRef),
        tx.get(worldRef),
      ]);
      this.ownerId();
      const persisted = stateSnap.exists()
        ? decodeCompanionSnapshot(stateSnap.data())
        : null;
      const persistedRevision = persisted?.revision ?? 0;
      const persistedWorldRevision = worldSnap.exists()
        ? (decodeWorldState(worldSnap.data()).revision ?? 0)
        : 0;
      // Reset is the emergency recovery path as well as a destructive action.
      // It must heal a stale state/world revision pair instead of refusing to run.
      resetRevision = Math.max(persistedRevision, persistedWorldRevision) + 1;
      tx.set(
        stateRef,
        sanitizeForFirestore(
          encodeCompanionSnapshot({ ...snapshot, revision: resetRevision }),
        ),
      );
      tx.set(
        worldRef,
        sanitizeForFirestore(encodeWorldState(world, resetRevision)),
      );
    });

    const targets = snapshots.flatMap(({ name, docs }) =>
      docs.map((id) => this.childDoc(name, id)),
    );
    for (let index = 0; index < targets.length; index += 400) {
      this.ownerId();
      const batch = writeBatch(this.db());
      for (const ref of targets.slice(index, index + 400)) batch.delete(ref);
      await batch.commit();
    }

    if (editableContext) {
      // Clear only the memory field against the latest document. A personality
      // edit from another device during the reset must never be overwritten by
      // the snapshot captured before collection cleanup began.
      await this.updateEditableContext({
        memory: "",
        updatedAt: Date.now(),
      });
    }

    return {
      snapshot: { ...snapshot, revision: resetRevision },
      world,
    };
  }

  async loadIntimacyState(): Promise<IntimacyState | null> {
    const snapshot = await getDoc(this.childDoc("intimacy", "state"));
    return snapshot.exists() ? decodeIntimacyState(snapshot.data()) : null;
  }

  async commitIntimacyState(
    state: IntimacyState,
    expectedRevision: number,
  ): Promise<IntimacyState> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error("Некорректная intimacy revision.");
    const ref = this.childDoc("intimacy", "state");
    return runTransaction(this.db(), async (tx) => {
      const existing = await tx.get(ref);
      this.ownerId();
      const persisted = existing.exists()
        ? decodeIntimacyState(existing.data())
        : null;
      const persistedRevision = persisted?.revision ?? 0;
      if (persistedRevision !== expectedRevision)
        throw new Error("Intimacy state обновился в другом окне. [intimacy-state-conflict]");
      const next = encodeIntimacyState({
        ...state,
        revision: expectedRevision + 1,
      });
      tx.set(ref, sanitizeForFirestore(next));
      return decodeIntimacyState(next);
    });
  }

  async loadIntimacyPreferences(): Promise<IntimacyPreferencesDocument | null> {
    const snapshot = await getDoc(this.childDoc("intimacy", "preferences"));
    return snapshot.exists() ? decodeIntimacyPreferences(snapshot.data()) : null;
  }

  async commitIntimacyPreferences(
    preferences: IntimacyPreferencesDocument,
    expectedRevision: number,
  ): Promise<IntimacyPreferencesDocument> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error("Некорректная intimacy preferences revision.");
    const ref = this.childDoc("intimacy", "preferences");
    return runTransaction(this.db(), async (tx) => {
      const existing = await tx.get(ref);
      this.ownerId();
      const persisted = existing.exists()
        ? decodeIntimacyPreferences(existing.data())
        : null;
      const persistedRevision = persisted?.revision ?? 0;
      if (persistedRevision !== expectedRevision)
        throw new Error(
          "Intimacy preferences обновились в другом окне. [intimacy-preferences-conflict]",
        );
      const next = encodeIntimacyPreferences({
        ...preferences,
        revision: expectedRevision + 1,
      });
      tx.set(ref, sanitizeForFirestore(next));
      return decodeIntimacyPreferences(next);
    });
  }

  async listInitiatives(options?: { limit?: number }) {
    const max = options?.limit ?? 300;
    const q = query(
      this.subcollection("initiatives"),
      orderBy("createdAt", "desc"),
      limit(max),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => decodeInitiative(d.data(), d.id));
  }

  async saveInitiative(initiative: CharacterInitiative) {
    await setDoc(
      this.childDoc("initiatives", initiative.id),
      sanitizeForFirestore(encodeInitiative(initiative)),
    );
  }

  async getMemory(id: string) {
    const snapshot = await getDoc(this.childDoc("memories", id));
    return snapshot.exists() ? decodeMemoryRecord(snapshot.data(), id) : null;
  }

  async listMemories(options?: {
    includeArchived?: boolean;
    limit?: number;
    sortBy?: "updatedAt" | "importance" | "createdAt";
    direction?: "asc" | "desc";
    statuses?: MemoryRecord["status"][];
    kinds?: MemoryRecord["kind"][];
    topicsAny?: string[];
  }) {
    const max = options?.limit ?? 600;
    const sortBy = options?.sortBy ?? "updatedAt";
    const direction = options?.direction ?? "desc";
    const constraints: QueryConstraint[] = [];
    const statuses = options?.statuses?.length
      ? options.statuses
      : options?.includeArchived
        ? []
        : (["active"] as MemoryRecord["status"][]);
    if (statuses.length === 1) constraints.push(where("status", "==", statuses[0]));
    else if (statuses.length > 1) constraints.push(where("status", "in", statuses));
    if (options?.kinds?.length === 1) constraints.push(where("kind", "==", options.kinds[0]));
    else if (options?.kinds && options.kinds.length > 1)
      constraints.push(where("kind", "in", options.kinds));
    if (options?.topicsAny?.length)
      constraints.push(
        where(
          "topics",
          "array-contains-any",
          [...new Set(options.topicsAny.map((topic) => topic.toLowerCase()))].slice(0, 30),
        ),
      );
    constraints.push(orderBy(sortBy, direction), limit(max));
    const snapshot = await getDocs(query(this.subcollection("memories"), ...constraints));
    return snapshot.docs.map((d) => decodeMemoryRecord(d.data(), d.id));
  }

  async saveMemory(memory: MemoryRecord) {
    await setDoc(
      this.childDoc("memories", memory.id),
      sanitizeForFirestore(encodeMemoryRecord(memory)),
    );
  }

  async reinforceMemories(memoryIds: string[], now: number) {
    const ids = [...new Set(memoryIds)].slice(0, 8);
    if (!ids.length) return;
    await runTransaction(this.db(), async (tx) => {
      const refs = ids.map((id) => this.childDoc("memories", id));
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
      this.ownerId();
      snaps.forEach((snap, index) => {
        if (!snap.exists()) return;
        const memory = decodeMemoryRecord(snap.data(), ids[index]);
        if (memory.status !== "active") return;
        tx.set(
          refs[index],
          sanitizeForFirestore(encodeMemoryRecord(reinforceMemory(memory, now))),
        );
      });
    });
  }

  async listKnowledgeFacts(options?: {
    key?: string;
    statuses?: KnowledgeFact["status"][];
    limit?: number;
  }) {
    const constraints: QueryConstraint[] = [];
    if (options?.key) constraints.push(where("key", "==", options.key));
    if (options?.statuses?.length === 1)
      constraints.push(where("status", "==", options.statuses[0]));
    else if (options?.statuses && options.statuses.length > 1)
      constraints.push(where("status", "in", options.statuses));
    constraints.push(
      orderBy("lastConfirmedAt", "desc"),
      orderBy(documentId(), "asc"),
      limit(options?.limit ?? 400),
    );
    const snapshot = await getDocs(
      query(this.subcollection("knowledge"), ...constraints),
    );
    return snapshot.docs.map((d) => decodeKnowledgeFact(d.data(), d.id));
  }

  async saveKnowledgeFact(fact: KnowledgeFact) {
    await setDoc(
      this.childDoc("knowledge", fact.id),
      sanitizeForFirestore(encodeKnowledgeFact(fact)),
    );
  }

  async mergeKnowledgeFact(candidate: KnowledgeFact): Promise<KnowledgeMergeResult> {
    // Querying before the transaction is only a legacy-repair aid. The head
    // document is the serialization point, so concurrent devices cannot both
    // publish different active values for the same logical key.
    const legacyActive = await this.listKnowledgeFacts({
      key: candidate.key,
      statuses: ["active"],
      limit: 40,
    });
    const headRef = this.childDoc("knowledgeHeads", knowledgeHeadId(candidate.key));

    return runTransaction(this.db(), async (tx) => {
      const headSnap = await tx.get(headRef);
      this.ownerId();
      const head = headSnap.exists()
        ? (headSnap.data() as { activeFactId?: unknown; revision?: unknown })
        : null;
      const activeIds = new Set(legacyActive.map((fact) => fact.id));
      if (typeof head?.activeFactId === "string" && head.activeFactId)
        activeIds.add(head.activeFactId);
      activeIds.add(candidate.id);

      const refs = [...activeIds].map((id) => [id, this.childDoc("knowledge", id)] as const);
      const snaps = await Promise.all(refs.map(([, ref]) => tx.get(ref)));
      const stored = snaps
        .map((snap, index) =>
          snap.exists() ? decodeKnowledgeFact(snap.data(), refs[index][0]) : null,
        )
        .filter((fact): fact is KnowledgeFact => fact !== null);
      const active = stored
        .filter((fact) => fact.key === candidate.key && fact.status === "active")
        .sort((a, b) => compareFactRecency(b, a));
      const exact = active.find((fact) => sameFactValue(fact, candidate));
      const revision = Number.isSafeInteger(head?.revision) ? Number(head?.revision) : 0;

      if (exact) {
        const sourceEventIds = [...new Set([...exact.sourceEventIds, ...candidate.sourceEventIds])];
        const sourceMemoryIds = [...new Set([...exact.sourceMemoryIds, ...candidate.sourceMemoryIds])];
        const isNewEvidence =
          sourceEventIds.length !== exact.sourceEventIds.length ||
          sourceMemoryIds.length !== exact.sourceMemoryIds.length;
        const updated: KnowledgeFact = {
          ...exact,
          confidence: isNewEvidence
            ? Math.min(1, exact.confidence + (1 - exact.confidence) * 0.18)
            : exact.confidence,
          evidenceCount: exact.evidenceCount + (isNewEvidence ? 1 : 0),
          sourceEventIds,
          sourceMemoryIds,
          updatedAt: Math.max(exact.updatedAt, candidate.updatedAt),
          lastConfirmedAt: Math.max(exact.lastConfirmedAt, candidate.lastConfirmedAt),
        };
        const retired = active
          .filter((fact) => fact.id !== updated.id)
          .map((fact) => ({
            ...fact,
            status: "outdated" as const,
            validUntil: updated.validFrom,
            updatedAt: Math.max(fact.updatedAt, candidate.updatedAt),
            supersededByFactId: updated.id,
          }));
        tx.set(this.childDoc("knowledge", updated.id), sanitizeForFirestore(encodeKnowledgeFact(updated)));
        for (const fact of retired)
          tx.set(this.childDoc("knowledge", fact.id), sanitizeForFirestore(encodeKnowledgeFact(fact)));
        tx.set(headRef, sanitizeForFirestore({
          key: candidate.key,
          activeFactId: updated.id,
          value: updated.value,
          lastConfirmedAt: updated.lastConfirmedAt,
          revision: revision + 1,
          updatedAt: candidate.updatedAt,
        }));
        return { activeFact: updated, candidateFact: updated, outcome: "confirmed" as const, supersededFacts: retired };
      }

      const current = active[0];
      if (current && currentFactOutranksCandidate(current, candidate)) {
        const historical: KnowledgeFact = {
          ...candidate,
          status: "outdated",
          validUntil: current.validFrom,
          supersededByFactId: current.id,
        };
        tx.set(this.childDoc("knowledge", historical.id), sanitizeForFirestore(encodeKnowledgeFact(historical)));
        tx.set(headRef, sanitizeForFirestore({
          key: candidate.key,
          activeFactId: current.id,
          value: current.value,
          lastConfirmedAt: current.lastConfirmedAt,
          revision: revision + 1,
          updatedAt: Math.max(candidate.updatedAt, current.updatedAt),
        }));
        return { activeFact: current, candidateFact: historical, outcome: "historical" as const, supersededFacts: [] };
      }

      const activeCandidate: KnowledgeFact = { ...candidate, status: "active" };
      const retired = active
        .filter((fact) => fact.id !== activeCandidate.id)
        .map((fact) => ({
          ...fact,
          status: "outdated" as const,
          validUntil: activeCandidate.validFrom,
          updatedAt: Math.max(fact.updatedAt, activeCandidate.updatedAt),
          supersededByFactId: activeCandidate.id,
        }));
      tx.set(this.childDoc("knowledge", activeCandidate.id), sanitizeForFirestore(encodeKnowledgeFact(activeCandidate)));
      for (const fact of retired)
        tx.set(this.childDoc("knowledge", fact.id), sanitizeForFirestore(encodeKnowledgeFact(fact)));
      tx.set(headRef, sanitizeForFirestore({
        key: candidate.key,
        activeFactId: activeCandidate.id,
        value: activeCandidate.value,
        lastConfirmedAt: activeCandidate.lastConfirmedAt,
        revision: revision + 1,
        updatedAt: activeCandidate.updatedAt,
      }));
      return { activeFact: activeCandidate, candidateFact: activeCandidate, outcome: "created" as const, supersededFacts: retired };
    });
  }

  async listOpenThreads(options?: {
    statuses?: OpenThread["status"][];
    limit?: number;
  }) {
    const constraints: QueryConstraint[] = [];
    if (options?.statuses?.length === 1)
      constraints.push(where("status", "==", options.statuses[0]));
    else if (options?.statuses && options.statuses.length > 1)
      constraints.push(where("status", "in", options.statuses));
    constraints.push(
      orderBy("lastTouchedAt", "desc"),
      orderBy(documentId(), "asc"),
      limit(options?.limit ?? 200),
    );
    const snapshot = await getDocs(
      query(this.subcollection("openThreads"), ...constraints),
    );
    return snapshot.docs.map((d) => decodeOpenThread(d.data(), d.id));
  }

  async saveOpenThread(thread: OpenThread) {
    await setDoc(
      this.childDoc("openThreads", thread.id),
      sanitizeForFirestore(encodeOpenThread(thread)),
    );
  }

}
