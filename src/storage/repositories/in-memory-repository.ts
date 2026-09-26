import type {
  CompanionRepository,
  CompanionSnapshot,
  MemoryRecoveryState,
  RuntimePersistenceState,
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
import { reinforceMemory } from "../../memory/model";
import type { CharacterInitiative } from "../../initiative/initiative";
import type { IntimacyPreferencesDocument, IntimacyState } from "../../intimacy/intimacy";
import type { YuzukiEditableContext, YuzukiEditableContextPatch } from "../../context/yuzuki-context";
import { normalizeEditableContext } from "../../context/yuzuki-context";
import {
  decodeIntimacyPreferences,
  decodeIntimacyState,
  encodeIntimacyPreferences,
  encodeIntimacyState,
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

function sameEvent(a: CharacterEvent, b: CharacterEvent) {
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

function validateTurnEvents(events: CharacterEvent[]) {
  if (events.length < 2)
    throw new Error("Некорректный turn: отсутствует пара user/character.");
  if (new Set(events.map((event) => event.id)).size !== events.length)
    throw new Error("Некорректный turn: повторяющийся event id.");
  if (events[0].type !== "message" || events[0].source !== "user")
    throw new Error("Некорректный turn: первое событие должно быть user message.");
  if (events[1].type !== "message" || events[1].source !== "character")
    throw new Error(
      "Некорректный turn: второе событие должно быть character reply.",
    );
  const inReplyTo = String(
    (events[1].payload as { inReplyTo?: unknown } | null)?.inReplyTo ?? "",
  );
  if (inReplyTo !== events[0].id)
    throw new Error("Некорректный turn: reply не связан с user event.");
}

export class InMemoryCompanionRepository implements CompanionRepository {
  private events: CharacterEvent[] = [];
  private memories: MemoryRecord[] = [];
  private consolidatedEventVersions = new Map<string, number>();
  private pendingMemoryEventIds = new Set<string>();
  private pendingTurnIds = new Set<string>();
  private memoryRecoveryState: MemoryRecoveryState | null = null;
  private facts: KnowledgeFact[] = [];
  private threads: OpenThread[] = [];
  private snapshot: CompanionSnapshot | null = null;
  private world: WorldState | null = null;
  private worldRevision: number | null = null;
  private initiatives: CharacterInitiative[] = [];
  private intimacyState: IntimacyState | null = null;
  private intimacyPreferences: IntimacyPreferencesDocument | null = null;
  private editableContext: YuzukiEditableContext | null = null;

  private queueMemoryEvent(event: CharacterEvent) {
    this.pendingMemoryEventIds.add(event.id);
  }

  async appendEvent(event: CharacterEvent) {
    const copy = structuredClone(event);
    const existing = this.events.find((item) => item.id === event.id);
    if (!existing) {
      this.events.push(copy);
      if (copy.type === "message" && copy.source === "user")
        this.pendingTurnIds.add(copy.id);
      return;
    }
    if (!sameEvent(existing, event))
      throw new Error(`event-id-collision:${event.id}`);
    if (event.type === "message" && event.source === "user")
      this.pendingTurnIds.add(event.id);
  }

  async getEvent(id: string) {
    return structuredClone(this.events.find((event) => event.id === id) ?? null);
  }

  async listPendingTurns(limit = 100) {
    const pending = this.events
      .filter(
        (event) =>
          this.pendingTurnIds.has(event.id) &&
          event.type === "message" &&
          event.source === "user" &&
          !this.events.some(
            (candidate) =>
              candidate.type === "message" &&
              candidate.source === "character" &&
              String(
                (candidate.payload as { inReplyTo?: unknown } | null)?.inReplyTo ?? "",
              ) === event.id,
          ),
      )
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
      .slice(0, Math.max(1, Math.min(limit, 200)));
    return structuredClone(pending);
  }

  async dismissPendingTurn(messageId: string) {
    this.pendingTurnIds.delete(messageId);
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

    const existingReply = this.events.find((event) => event.id === events[1].id);
    if (existingReply) {
      const savedInReplyTo = String(
        (existingReply.payload as { inReplyTo?: unknown } | null)?.inReplyTo ?? "",
      );
      if (
        existingReply.type === "message" &&
        existingReply.source === "character" &&
        savedInReplyTo === events[0].id
      )
        throw new Error("turn-already-committed");
      throw new Error(`event-id-collision:${events[1].id}`);
    }
    for (const event of events) {
      const existing = this.events.find((item) => item.id === event.id);
      if (existing && !sameEvent(existing, event))
        throw new Error(`event-id-collision:${event.id}`);
    }

    const persistedRevision = this.snapshot?.revision ?? 0;
    if (
      this.worldRevision !== null &&
      this.worldRevision !== persistedRevision
    )
      throw new Error(
        "Состояние мира и персонажа рассинхронизировано. [state-world-conflict]",
      );
    if (persistedRevision !== expectedRevision)
      throw new Error("Состояние изменилось. [state-conflict]");

    for (const event of events) await this.appendEvent(event);
    this.pendingTurnIds.delete(events[0].id);
    const nextRevision = expectedRevision + 1;
    this.snapshot = structuredClone({ ...snapshot, revision: nextRevision });
    this.world = structuredClone(world);
    this.worldRevision = nextRevision;
  }

  async listRecentEvents(limit = 30) {
    return structuredClone(
      [...this.events]
        .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
        .slice(-limit),
    );
  }

  async listConversationEvents(options?: {
    before?: { timestamp: number; id: string } | null;
    limit?: number;
  }): Promise<ConversationPage> {
    const max = Math.max(1, Math.min(options?.limit ?? 80, 120));
    const before = options?.before ?? null;
    const ordered = [...this.events]
      .filter(
        (event) =>
          (event.type === "message" || event.type === "character_action") &&
          event.source !== "system",
      )
      .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
      .filter(
        (event) =>
          !before ||
          event.timestamp < before.timestamp ||
          (event.timestamp === before.timestamp && event.id < before.id),
      );
    const page = ordered.slice(0, max);
    const oldest = page.at(-1);
    return {
      events: structuredClone(page.reverse()),
      nextCursor: oldest
        ? { timestamp: oldest.timestamp, id: oldest.id }
        : before,
      hasMore: ordered.length > max,
    };
  }

  async listEventsForMemoryBackfill(options?: {
    after?: { timestamp: number; id: string } | null;
    limit?: number;
  }) {
    const after = options?.after ?? null;
    const max = options?.limit ?? 120;
    const ordered = [...this.events].sort(
      (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
    );
    return structuredClone(
      ordered
        .filter(
          (event) =>
            !after ||
            event.timestamp > after.timestamp ||
            (event.timestamp === after.timestamp && event.id > after.id),
        )
        .slice(0, max),
    );
  }

  async listPendingMemoryEvents(limit = 120) {
    const pending = this.events
      .filter((event) => this.pendingMemoryEventIds.has(event.id))
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
      .slice(0, limit);
    return structuredClone(pending);
  }

  async loadMemoryRecoveryState() {
    return this.memoryRecoveryState
      ? structuredClone(this.memoryRecoveryState)
      : null;
  }

  async saveMemoryRecoveryState(state: MemoryRecoveryState) {
    this.memoryRecoveryState = structuredClone(state);
  }

  async listConsolidatedEventIds(_since: number) {
    return [...this.consolidatedEventVersions.entries()]
      .filter(([, version]) => version === MEMORY_PROCESSOR_VERSION)
      .map(([eventId]) => eventId);
  }

  async isEventConsolidated(eventId: string) {
    return this.consolidatedEventVersions.get(eventId) === MEMORY_PROCESSOR_VERSION;
  }

  async markEventConsolidated(eventId: string, _timestamp?: number) {
    this.consolidatedEventVersions.set(eventId, MEMORY_PROCESSOR_VERSION);
    this.pendingMemoryEventIds.delete(eventId);
  }

  async loadRuntimeState(): Promise<RuntimePersistenceState> {
    if (
      this.snapshot?.revision !== undefined &&
      this.worldRevision !== null &&
      this.snapshot.revision !== this.worldRevision
    )
      throw new Error(
        "Состояние мира и персонажа рассинхронизировано. [state-world-conflict]",
      );
    return {
      snapshot: this.snapshot ? structuredClone(this.snapshot) : null,
      world: this.world ? structuredClone(this.world) : null,
    };
  }

  async loadSnapshot() {
    return (await this.loadRuntimeState()).snapshot;
  }

  async loadWorldState() {
    return (await this.loadRuntimeState()).world;
  }

  async loadEditableContext() {
    return this.editableContext ? structuredClone(this.editableContext) : null;
  }

  async saveEditableContext(context: YuzukiEditableContext) {
    const normalized = normalizeEditableContext(context, Date.now());
    this.editableContext = structuredClone(normalized);
    return structuredClone(normalized);
  }

  async updateEditableContext(patch: YuzukiEditableContextPatch) {
    const now = Date.now();
    const current = this.editableContext ?? normalizeEditableContext(null, now);
    const normalized = normalizeEditableContext({
      ...current,
      ...patch,
      updatedAt: Math.max(current.updatedAt, patch.updatedAt ?? 0, now),
    }, now);
    this.editableContext = structuredClone(normalized);
    return structuredClone(normalized);
  }

  async resetConversationAndMemory(
    snapshot: CompanionSnapshot,
    world: WorldState,
  ): Promise<RuntimePersistenceState> {
    const nextRevision = (this.snapshot?.revision ?? 0) + 1;
    this.events = [];
    this.memories = [];
    this.consolidatedEventVersions.clear();
    this.pendingMemoryEventIds.clear();
    this.pendingTurnIds.clear();
    this.memoryRecoveryState = null;
    this.facts = [];
    this.threads = [];
    this.initiatives = [];
    this.intimacyState = null;
    this.intimacyPreferences = null;
    if (this.editableContext) {
      this.editableContext = {
        ...this.editableContext,
        memory: "",
        updatedAt: Date.now(),
      };
    }
    this.snapshot = structuredClone({ ...snapshot, revision: nextRevision });
    this.world = structuredClone(world);
    this.worldRevision = nextRevision;
    return this.loadRuntimeState();
  }

  async loadIntimacyState() {
    return this.intimacyState ? structuredClone(this.intimacyState) : null;
  }

  async commitIntimacyState(
    state: IntimacyState,
    expectedRevision: number,
  ) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error("Некорректная intimacy revision.");
    const persistedRevision = this.intimacyState?.revision ?? 0;
    if (persistedRevision !== expectedRevision)
      throw new Error(
        "Intimacy state обновился в другом окне. [intimacy-state-conflict]",
      );
    const next = decodeIntimacyState(
      encodeIntimacyState({
        ...state,
        revision: expectedRevision + 1,
      }),
    );
    this.intimacyState = structuredClone(next);
    return structuredClone(next);
  }

  async loadIntimacyPreferences() {
    return this.intimacyPreferences
      ? structuredClone(this.intimacyPreferences)
      : null;
  }

  async commitIntimacyPreferences(
    preferences: IntimacyPreferencesDocument,
    expectedRevision: number,
  ) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error("Некорректная intimacy preferences revision.");
    const persistedRevision = this.intimacyPreferences?.revision ?? 0;
    if (persistedRevision !== expectedRevision)
      throw new Error(
        "Intimacy preferences обновились в другом окне. [intimacy-preferences-conflict]",
      );
    const next = decodeIntimacyPreferences(
      encodeIntimacyPreferences({
        ...preferences,
        revision: expectedRevision + 1,
      }),
    );
    this.intimacyPreferences = structuredClone(next);
    return structuredClone(next);
  }

  async listInitiatives(options?: { limit?: number }) {
    const max = options?.limit ?? 300;
    return structuredClone(
      [...this.initiatives]
        .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
        .slice(0, max),
    );
  }

  async saveInitiative(initiative: CharacterInitiative) {
    this.initiatives = [
      ...this.initiatives.filter((item) => item.id !== initiative.id),
      structuredClone(initiative),
    ];
  }

  async getMemory(id: string) {
    return structuredClone(this.memories.find((memory) => memory.id === id) ?? null);
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
    const statuses = options?.statuses;
    const kinds = options?.kinds;
    let items = [...this.memories];
    if (statuses?.length)
      items = items.filter((memory) => statuses.includes(memory.status));
    else if (!(options?.includeArchived ?? false))
      items = items.filter((memory) => memory.status === "active");
    if (kinds?.length)
      items = items.filter((memory) => kinds.includes(memory.kind));
    if (options?.topicsAny?.length) {
      const topics = new Set(options.topicsAny.map((topic) => topic.toLowerCase()));
      items = items.filter((memory) =>
        memory.topics.some((topic) => topics.has(topic.toLowerCase())),
      );
    }
    items.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      const diff = av === bv ? a.id.localeCompare(b.id) : av - bv;
      return direction === "asc" ? diff : -diff;
    });
    return structuredClone(items.slice(0, max));
  }

  async saveMemory(memory: MemoryRecord) {
    this.memories = [
      ...this.memories.filter((item) => item.id !== memory.id),
      structuredClone(memory),
    ];
  }

  async reinforceMemories(memoryIds: string[], now: number) {
    const ids = new Set(memoryIds);
    this.memories = this.memories.map((memory) =>
      ids.has(memory.id) && memory.status === "active"
        ? reinforceMemory(memory, now)
        : memory,
    );
  }

  async listKnowledgeFacts(options?: {
    key?: string;
    statuses?: KnowledgeFact["status"][];
    limit?: number;
  }) {
    const max = options?.limit ?? 400;
    let items = [...this.facts];
    if (options?.key) items = items.filter((fact) => fact.key === options.key);
    if (options?.statuses?.length)
      items = items.filter((fact) => options.statuses!.includes(fact.status));
    items.sort(
      (a, b) =>
        b.lastConfirmedAt - a.lastConfirmedAt || a.id.localeCompare(b.id),
    );
    return structuredClone(items.slice(0, max));
  }

  async saveKnowledgeFact(fact: KnowledgeFact) {
    this.facts = [
      ...this.facts.filter((item) => item.id !== fact.id),
      structuredClone(fact),
    ];
  }

  async mergeKnowledgeFact(candidate: KnowledgeFact): Promise<KnowledgeMergeResult> {
    const sameValue = (a: KnowledgeFact, b: KnowledgeFact) =>
      a.value.trim().toLowerCase() === b.value.trim().toLowerCase();
    const recency = (a: KnowledgeFact, b: KnowledgeFact) =>
      a.lastConfirmedAt - b.lastConfirmedAt || a.id.localeCompare(b.id);
    const currentOutranksCandidate = (current: KnowledgeFact) => {
      if (current.lastConfirmedAt !== candidate.lastConfirmedAt)
        return current.lastConfirmedAt > candidate.lastConfirmedAt;
      const sameEvidence = candidate.sourceEventIds.some((id) =>
        current.sourceEventIds.includes(id),
      );
      if (sameEvidence) return false;
      return current.id.localeCompare(candidate.id) > 0;
    };

    const active = this.facts
      .filter((fact) => fact.key === candidate.key && fact.status === "active")
      .sort((a, b) => recency(b, a));
    const exact = active.find((fact) => sameValue(fact, candidate));

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
      const duplicates = active.filter((fact) => fact.id !== exact.id);
      const retired = duplicates.map((fact) => ({
        ...fact,
        status: "outdated" as const,
        validUntil: updated.validFrom,
        updatedAt: Math.max(fact.updatedAt, candidate.updatedAt),
        supersededByFactId: updated.id,
      }));
      this.facts = [
        ...this.facts.filter((fact) => fact.id !== updated.id && !retired.some((r) => r.id === fact.id)),
        updated,
        ...retired,
      ];
      return structuredClone({
        activeFact: updated,
        candidateFact: updated,
        outcome: "confirmed" as const,
        supersededFacts: retired,
      });
    }

    const current = active[0];
    if (current && currentOutranksCandidate(current)) {
      const historical: KnowledgeFact = {
        ...candidate,
        status: "outdated",
        validUntil: current.validFrom,
        supersededByFactId: current.id,
      };
      this.facts = [
        ...this.facts.filter((fact) => fact.id !== historical.id),
        historical,
      ];
      return structuredClone({
        activeFact: current,
        candidateFact: historical,
        outcome: "historical" as const,
        supersededFacts: [],
      });
    }

    const retired = active.map((fact) => ({
      ...fact,
      status: "outdated" as const,
      validUntil: candidate.validFrom,
      updatedAt: Math.max(fact.updatedAt, candidate.updatedAt),
      supersededByFactId: candidate.id,
    }));
    const activeCandidate: KnowledgeFact = { ...candidate, status: "active" };
    this.facts = [
      ...this.facts.filter(
        (fact) =>
          fact.id !== activeCandidate.id && !retired.some((retiredFact) => retiredFact.id === fact.id),
      ),
      activeCandidate,
      ...retired,
    ];
    return structuredClone({
      activeFact: activeCandidate,
      candidateFact: activeCandidate,
      outcome: "created" as const,
      supersededFacts: retired,
    });
  }

  async listOpenThreads(options?: {
    statuses?: OpenThread["status"][];
    limit?: number;
  }) {
    const max = options?.limit ?? 200;
    let items = [...this.threads];
    if (options?.statuses?.length)
      items = items.filter((thread) => options.statuses!.includes(thread.status));
    items.sort(
      (a, b) => b.lastTouchedAt - a.lastTouchedAt || a.id.localeCompare(b.id),
    );
    return structuredClone(items.slice(0, max));
  }

  async saveOpenThread(thread: OpenThread) {
    this.threads = [
      ...this.threads.filter((item) => item.id !== thread.id),
      structuredClone(thread),
    ];
  }
}
