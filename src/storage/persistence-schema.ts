import { SCHEMA_VERSION } from "../config/version";
import { initialEmotionalState } from "../emotions/emotion-engine";
import type { EmotionalState } from "../emotions/emotion-types";
import type { CharacterEvent, EventType } from "../events/event-types";
import type { CharacterInitiative } from "../initiative/initiative-types";
import {
  createInitialIntimacyPreferences,
  createInitialIntimacyState,
  isNeutralIntimacyPoseId,
  isNeutralIntimacySceneId,
  isNeutralIntimacyStageId,
} from "../intimacy/intimacy-state";
import type {
  IntimacyInteractionStatus,
  IntimacyPhase,
  IntimacyPreference,
  IntimacyPreferenceOrigin,
  IntimacyPreferencesDocument,
  IntimacyPreferenceStance,
  IntimacyPrivacyLevel,
  IntimacyState,
  IntimacyStoragePolicy,
} from "../intimacy/intimacy-types";
import type {
  KnowledgeFact,
  KnowledgeStatus,
  KnowledgeSubject,
  MemoryKind,
  MemoryRecord,
  MemoryStatus,
  OpenThread,
  OpenThreadStatus,
} from "../memory/memory-types";
import { initialRelationshipState } from "../relationship/relationship-engine";
import type { RelationshipState } from "../relationship/relationship-types";
import { createInitialWorldState } from "../world/world-engine";
import { isValidTimeZone, resolveSystemTimeZone } from "../world/time-engine";
import type {
  Availability,
  TimeOfDay,
  WorldActivity,
  WorldEventSnapshot,
  WorldLocation,
  WorldState,
} from "../world/world-types";
import type { CompanionSnapshot, MemoryRecoveryState } from "./repositories/interfaces";

import { decodeAppearance } from "../avatar/appearance";
import { decodeRomance } from "../relationship/romance";

export const STORAGE_SCHEMA_VERSION = 2;
export const MEMORY_PROCESSOR_VERSION = 4;
const LEGACY_MEMORY_PROCESSOR_VERSION = 1;

export class PersistenceSchemaError extends Error {
  readonly code = "persistence-schema";

  constructor(entity: string, message: string) {
    super(`Некорректные сохранённые данные (${entity}): ${message}`);
    this.name = "PersistenceSchemaError";
  }
}

type RecordValue = Record<string, unknown>;

const eventTypes: EventType[] = [
  "message",
  "character_action",
  "gift",
  "activity",
  "relationship",
  "world",
  "intimacy",
];
const eventSources = ["user", "character", "system"] as const;
const memoryKinds: MemoryKind[] = ["working", "short_term", "episodic", "semantic"];
const memoryStatuses: MemoryStatus[] = ["active", "outdated", "archived"];
const knowledgeSubjects: KnowledgeSubject[] = ["user", "character", "relationship", "world"];
const knowledgeStatuses: KnowledgeStatus[] = ["active", "outdated", "disputed"];
const threadStatuses: OpenThreadStatus[] = ["open", "resolved", "dropped"];
const initiativeKinds: CharacterInitiative["kind"][] = [
  "continue_thread",
  "share_world_event",
  "ask_about_user",
  "suggest_activity",
  "share_thought",
  "affectionate_checkin",
];
const initiativeStatuses: CharacterInitiative["status"][] = [
  "pending",
  "surfaced",
  "dismissed",
  "expired",
];
const worldLocations: WorldLocation[] = [
  "bedroom",
  "living_room",
  "kitchen",
  "outside",
  "cafe",
  "unknown",
];
const worldActivities: WorldActivity[] = [
  "sleeping",
  "waking_up",
  "breakfast",
  "personal_project",
  "reading",
  "music",
  "walk",
  "cooking",
  "errands",
  "cafe_break",
  "relaxing",
  "chatting",
  "idle",
];
const timesOfDay: TimeOfDay[] = ["night", "morning", "day", "evening"];
const availabilities: Availability[] = ["sleeping", "free", "occupied", "resting"];
const worldEventKinds: WorldEventSnapshot["kind"][] = [
  "routine",
  "small_win",
  "minor_annoyance",
  "reflection",
  "outing",
];
const relationshipStages: RelationshipState["stage"][] = [
  "new",
  "familiar",
  "close",
  "deep",
];
const intimacyPhases: IntimacyPhase[] = [
  "normal",
  "romantic",
  "close",
  "intimate",
  "high_intimacy",
  "aftercare",
  "paused",
];
const intimacyInteractionStatuses: IntimacyInteractionStatus[] = [
  "inactive",
  "open",
  "hesitant",
  "paused",
  "stopped",
];
const intimacyStoragePolicies: IntimacyStoragePolicy[] = [
  "full",
  "memories_only",
  "disabled",
];
const intimacyPrivacyLevels: IntimacyPrivacyLevel[] = [
  "public",
  "semi_private",
  "private",
  "fully_private",
];
const intimacyPreferenceStances: IntimacyPreferenceStance[] = [
  "like",
  "dislike",
  "neutral",
  "uncertain",
];
const intimacyPreferenceOrigins: IntimacyPreferenceOrigin[] = ["core", "learned"];
const emotionDeltaKeys = new Set([
  "mood",
  "energy",
  "happiness",
  "irritation",
  "sadness",
  "anxiety",
  "curiosity",
  "boredom",
  "affection",
  "romanticInterest",
]);

function record(value: unknown, entity: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PersistenceSchemaError(entity, "ожидался объект");
  }
  return value as RecordValue;
}

function storageVersion(data: RecordValue, entity: string, current = STORAGE_SCHEMA_VERSION) {
  if (data.schemaVersion === undefined) return 0;
  const value = Number(data.schemaVersion);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new PersistenceSchemaError(entity, "некорректная schemaVersion");
  if (value > current)
    throw new PersistenceSchemaError(
      entity,
      `версия схемы ${value} новее поддерживаемой ${current}`,
    );
  return value;
}

function requiredString(value: unknown, entity: string, field: string, fallback?: string) {
  if (typeof value === "string" && value.trim()) return value;
  if (fallback !== undefined) return fallback;
  throw new PersistenceSchemaError(entity, `отсутствует ${field}`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function finiteNumber(
  value: unknown,
  entity: string,
  field: string,
  fallback?: number,
) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new PersistenceSchemaError(entity, `некорректное поле ${field}`);
}

function boundedNumber(
  value: unknown,
  entity: string,
  field: string,
  fallback?: number,
) {
  const number = finiteNumber(value, entity, field, fallback);
  if (number < 0 || number > 1)
    throw new PersistenceSchemaError(entity, `${field} должен быть в диапазоне 0..1`);
  return number;
}

function safeInteger(
  value: unknown,
  entity: string,
  field: string,
  fallback?: number,
) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return value;
  if (fallback !== undefined) return fallback;
  throw new PersistenceSchemaError(entity, `некорректное поле ${field}`);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  entity: string,
  field: string,
  fallback?: T,
): T {
  if (typeof value === "string" && allowed.includes(value as T)) return value as T;
  if (fallback !== undefined) return fallback;
  throw new PersistenceSchemaError(entity, `некорректное поле ${field}`);
}

function stringArray(
  value: unknown,
  entity: string,
  field: string,
  fallback?: string[],
) {
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new PersistenceSchemaError(entity, `отсутствует ${field}`);
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new PersistenceSchemaError(entity, `некорректное поле ${field}`);
  return [...value] as string[];
}


function booleanValue(
  value: unknown,
  entity: string,
  field: string,
  fallback?: boolean,
) {
  if (typeof value === "boolean") return value;
  if (fallback !== undefined) return fallback;
  throw new PersistenceSchemaError(entity, `некорректное поле ${field}`);
}

function optionalFiniteNumber(value: unknown, entity: string, field: string) {
  if (value === undefined || value === null) return undefined;
  return finiteNumber(value, entity, field);
}

function entityId(
  data: RecordValue,
  entity: string,
  expectedId?: string,
  allowLegacyFallback = false,
) {
  const id = requiredString(
    data.id,
    entity,
    "id",
    allowLegacyFallback ? expectedId : undefined,
  );
  if (expectedId && id !== expectedId)
    throw new PersistenceSchemaError(
      entity,
      `id документа ${expectedId} не совпадает с полем id ${id}`,
    );
  return id;
}

function migrateStorageRecord(raw: unknown, entity: string) {
  const data = record(raw, entity);
  const version = storageVersion(data, entity);
  if (version === STORAGE_SCHEMA_VERSION)
    return { data, legacy: false, sourceVersion: version };
  // v1 -> v2 adds persistent world timezone. Other records are structurally unchanged.
  if (version === 1)
    return {
      data: { ...data, schemaVersion: STORAGE_SCHEMA_VERSION },
      legacy: false,
      sourceVersion: 1,
    };
  // v0 means a pre-versioned document from v0.5.6 or earlier. Migration is read-time only.
  if (version === 0)
    return {
      data: { ...data, schemaVersion: STORAGE_SCHEMA_VERSION },
      legacy: true,
      sourceVersion: 0,
    };
  throw new PersistenceSchemaError(entity, `нет миграции с версии ${version}`);
}

function decodeEmotion(value: unknown, entity: string, legacy: boolean): EmotionalState {
  const data = record(value, `${entity}.emotion`);
  const fallback = initialEmotionalState;
  const read = (key: keyof Omit<EmotionalState, "updatedAt">) =>
    boundedNumber(data[key], entity, `emotion.${key}`, legacy ? fallback[key] : undefined);
  return {
    mood: read("mood"),
    energy: read("energy"),
    happiness: read("happiness"),
    irritation: read("irritation"),
    sadness: read("sadness"),
    anxiety: read("anxiety"),
    curiosity: read("curiosity"),
    boredom: read("boredom"),
    affection: read("affection"),
    romanticInterest: read("romanticInterest"),
    updatedAt: finiteNumber(
      data.updatedAt,
      entity,
      "emotion.updatedAt",
      legacy ? Date.now() : undefined,
    ),
  };
}

function decodeRelationship(value: unknown, entity: string, legacy: boolean): RelationshipState {
  const data = record(value, `${entity}.relationship`);
  const fallback = initialRelationshipState;
  const read = (key: keyof Omit<RelationshipState, "stage" | "updatedAt">) =>
    boundedNumber(data[key], entity, `relationship.${key}`, legacy ? fallback[key] : undefined);
  return {
    trust: read("trust"),
    closeness: read("closeness"),
    attachment: read("attachment"),
    security: read("security"),
    respect: read("respect"),
    unresolvedTension: read("unresolvedTension"),
    stage: enumValue(
      data.stage,
      relationshipStages,
      entity,
      "relationship.stage",
      legacy ? fallback.stage : undefined,
    ),
    updatedAt: finiteNumber(
      data.updatedAt,
      entity,
      "relationship.updatedAt",
      legacy ? Date.now() : undefined,
    ),
  };
}

export function encodeCompanionSnapshot(snapshot: CompanionSnapshot) {
  const validated = decodeCompanionSnapshot({
    ...snapshot,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
  return { ...validated, schemaVersion: STORAGE_SCHEMA_VERSION };
}

export function decodeCompanionSnapshot(raw: unknown): CompanionSnapshot {
  const entity = "state/current";
  const { data, legacy } = migrateStorageRecord(raw, entity);
  return {
    revision: safeInteger(data.revision, entity, "revision", legacy ? 0 : undefined),
    ...(data.romance === undefined ? {} : { romance: decodeRomance(data.romance) }),
    ...(data.appearance === undefined ? {} : { appearance: decodeAppearance(data.appearance) }),
    emotion: decodeEmotion(data.emotion, entity, legacy),
    relationship: decodeRelationship(data.relationship, entity, legacy),
  };
}

function decodeWorldEvent(raw: unknown, index: number, legacy: boolean): WorldEventSnapshot {
  const entity = `world.recentEvents[${index}]`;
  const data = record(raw, entity);
  const emotionalEffectRaw = data.emotionalEffect;
  let emotionalEffect: WorldEventSnapshot["emotionalEffect"] = {};
  if (emotionalEffectRaw !== undefined) {
    const effect = record(emotionalEffectRaw, `${entity}.emotionalEffect`);
    for (const [key, value] of Object.entries(effect)) {
      if (!emotionDeltaKeys.has(key))
        throw new PersistenceSchemaError(
          entity,
          `неизвестное поле emotionalEffect.${key}`,
        );
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new PersistenceSchemaError(
          entity,
          `некорректный emotionalEffect.${key}`,
        );
      emotionalEffect[key as keyof WorldEventSnapshot["emotionalEffect"]] =
        value;
    }
  } else if (!legacy) {
    throw new PersistenceSchemaError(entity, "отсутствует emotionalEffect");
  }
  return {
    id: requiredString(data.id, entity, "id"),
    at: finiteNumber(data.at, entity, "at"),
    kind: enumValue(data.kind, worldEventKinds, entity, "kind"),
    summary: requiredString(data.summary, entity, "summary"),
    location: enumValue(data.location, worldLocations, entity, "location", legacy ? "unknown" : undefined),
    activity: enumValue(data.activity, worldActivities, entity, "activity", legacy ? "idle" : undefined),
    emotionalEffect,
    shareWorthiness: boundedNumber(data.shareWorthiness, entity, "shareWorthiness", legacy ? 0 : undefined),
  };
}

export function encodeWorldState(world: WorldState, revision: number) {
  const validated = decodeWorldState({
    ...world,
    revision,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
  return {
    ...validated.world,
    revision: validated.revision,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  };
}

export function decodeWorldState(raw: unknown): { world: WorldState; revision: number } {
  const entity = "world/current";
  const { data, legacy, sourceVersion } = migrateStorageRecord(raw, entity);
  const referenceTime =
    (typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt) && data.updatedAt) ||
    (typeof data.lastSimulatedAt === "number" && Number.isFinite(data.lastSimulatedAt) && data.lastSimulatedAt) ||
    Date.now();
  const fallback = createInitialWorldState(referenceTime);
  const recentRaw = data.recentEvents;
  if (recentRaw === undefined && !legacy)
    throw new PersistenceSchemaError(entity, "отсутствует recentEvents");
  if (recentRaw !== undefined && !Array.isArray(recentRaw))
    throw new PersistenceSchemaError(entity, "recentEvents должен быть массивом");
  return {
    revision: safeInteger(data.revision, entity, "revision", legacy ? 0 : undefined),
    world: {
      timeZone: (() => {
        const fallback = sourceVersion < 2 ? resolveSystemTimeZone() : undefined;
        const value = requiredString(data.timeZone, entity, "timeZone", fallback);
        if (!isValidTimeZone(value))
          throw new PersistenceSchemaError(entity, "некорректное поле timeZone");
        return value;
      })(),
      currentLocation: enumValue(
        data.currentLocation,
        worldLocations,
        entity,
        "currentLocation",
        legacy ? fallback.currentLocation : undefined,
      ),
      currentActivity: enumValue(
        data.currentActivity,
        worldActivities,
        entity,
        "currentActivity",
        legacy ? fallback.currentActivity : undefined,
      ),
      timeOfDay: enumValue(
        data.timeOfDay,
        timesOfDay,
        entity,
        "timeOfDay",
        legacy ? fallback.timeOfDay : undefined,
      ),
      availability: enumValue(
        data.availability,
        availabilities,
        entity,
        "availability",
        legacy ? fallback.availability : undefined,
      ),
      isAwake:
        typeof data.isAwake === "boolean"
          ? data.isAwake
          : legacy
            ? fallback.isAwake
            : (() => {
                throw new PersistenceSchemaError(entity, "некорректное поле isAwake");
              })(),
      connectionDrive: boundedNumber(
        data.connectionDrive,
        entity,
        "connectionDrive",
        legacy ? fallback.connectionDrive : undefined,
      ),
      lastSimulatedAt: finiteNumber(
        data.lastSimulatedAt,
        entity,
        "lastSimulatedAt",
        legacy ? fallback.lastSimulatedAt : undefined,
      ),
      lastUserInteractionAt: finiteNumber(
        data.lastUserInteractionAt,
        entity,
        "lastUserInteractionAt",
        legacy ? fallback.lastUserInteractionAt : undefined,
      ),
      lastMeaningfulWorldEventAt: optionalFiniteNumber(
        data.lastMeaningfulWorldEventAt,
        entity,
        "lastMeaningfulWorldEventAt",
      ),
      recentEvents: (recentRaw ?? []).map((item, index) => decodeWorldEvent(item, index, legacy)),
      updatedAt: finiteNumber(data.updatedAt, entity, "updatedAt", legacy ? referenceTime : undefined),
    },
  };
}

export function decodeCharacterEvent(raw: unknown, expectedId?: string): CharacterEvent {
  const entity = expectedId ? `event/${expectedId}` : "event";
  const data = record(raw, entity);
  const rawVersion = data.schemaVersion === undefined ? 0 : Number(data.schemaVersion);
  if (!Number.isSafeInteger(rawVersion) || rawVersion < 0)
    throw new PersistenceSchemaError(entity, "некорректная schemaVersion");
  if (rawVersion > SCHEMA_VERSION)
    throw new PersistenceSchemaError(
      entity,
      `версия события ${rawVersion} новее поддерживаемой ${SCHEMA_VERSION}`,
    );
  return {
    id: entityId(data, entity, expectedId, rawVersion === 0),
    type: enumValue(data.type, eventTypes, entity, "type"),
    source: enumValue(data.source, eventSources, entity, "source"),
    timestamp: finiteNumber(data.timestamp, entity, "timestamp"),
    payload: data.payload,
    importance: boundedNumber(data.importance, entity, "importance", rawVersion === 0 ? 0.35 : undefined),
    schemaVersion: SCHEMA_VERSION,
    engineVersion:
      typeof data.engineVersion === "string" && data.engineVersion
        ? data.engineVersion
        : rawVersion < SCHEMA_VERSION
          ? "legacy"
          : (() => {
              throw new PersistenceSchemaError(entity, "отсутствует engineVersion");
            })(),
  };
}

function commonStoredEntity(raw: unknown, entity: string) {
  return migrateStorageRecord(raw, entity);
}

export function encodeMemoryRecord(memory: MemoryRecord) {
  const validated = decodeMemoryRecord({
    ...memory,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
  return { ...validated, schemaVersion: STORAGE_SCHEMA_VERSION };
}

export function decodeMemoryRecord(raw: unknown, expectedId?: string): MemoryRecord {
  const entity = expectedId ? `memory/${expectedId}` : "memory";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const createdAt = finiteNumber(data.createdAt, entity, "createdAt", legacy ? Date.now() : undefined);
  return {
    id: entityId(data, entity, expectedId, legacy),
    kind: enumValue(data.kind, memoryKinds, entity, "kind", legacy ? "episodic" : undefined),
    summary: requiredString(data.summary, entity, "summary"),
    sourceEventIds: stringArray(data.sourceEventIds, entity, "sourceEventIds", legacy ? [] : undefined),
    topics: stringArray(data.topics, entity, "topics", legacy ? [] : undefined),
    importance: boundedNumber(data.importance, entity, "importance", legacy ? 0.4 : undefined),
    confidence: boundedNumber(data.confidence, entity, "confidence", legacy ? 0.7 : undefined),
    emotionalWeight: boundedNumber(data.emotionalWeight, entity, "emotionalWeight", legacy ? 0.2 : undefined),
    retrievalStrength: boundedNumber(data.retrievalStrength, entity, "retrievalStrength", legacy ? 0.5 : undefined),
    accessCount: safeInteger(data.accessCount, entity, "accessCount", legacy ? 0 : undefined),
    createdAt,
    updatedAt: finiteNumber(data.updatedAt, entity, "updatedAt", legacy ? createdAt : undefined),
    lastAccessedAt: finiteNumber(data.lastAccessedAt, entity, "lastAccessedAt", legacy ? createdAt : undefined),
    validFrom: finiteNumber(data.validFrom, entity, "validFrom", legacy ? createdAt : undefined),
    validUntil: optionalFiniteNumber(data.validUntil, entity, "validUntil"),
    supersedesMemoryId: optionalString(data.supersedesMemoryId),
    contradictionGroup: optionalString(data.contradictionGroup),
    status: enumValue(data.status, memoryStatuses, entity, "status", legacy ? "active" : undefined),
  };
}

export function encodeKnowledgeFact(fact: KnowledgeFact) {
  const validated = decodeKnowledgeFact({
    ...fact,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
  return { ...validated, schemaVersion: STORAGE_SCHEMA_VERSION };
}

export function decodeKnowledgeFact(raw: unknown, expectedId?: string): KnowledgeFact {
  const entity = expectedId ? `knowledge/${expectedId}` : "knowledge";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const createdAt = finiteNumber(data.createdAt, entity, "createdAt", legacy ? Date.now() : undefined);
  return {
    id: entityId(data, entity, expectedId, legacy),
    subject: enumValue(data.subject, knowledgeSubjects, entity, "subject", legacy ? "user" : undefined),
    key: requiredString(data.key, entity, "key"),
    statement: requiredString(data.statement, entity, "statement"),
    value: requiredString(data.value, entity, "value"),
    confidence: boundedNumber(data.confidence, entity, "confidence", legacy ? 0.65 : undefined),
    evidenceCount: safeInteger(data.evidenceCount, entity, "evidenceCount", legacy ? 1 : undefined),
    sourceEventIds: stringArray(data.sourceEventIds, entity, "sourceEventIds", legacy ? [] : undefined),
    sourceMemoryIds: stringArray(data.sourceMemoryIds, entity, "sourceMemoryIds", legacy ? [] : undefined),
    createdAt,
    updatedAt: finiteNumber(data.updatedAt, entity, "updatedAt", legacy ? createdAt : undefined),
    lastConfirmedAt: finiteNumber(data.lastConfirmedAt, entity, "lastConfirmedAt", legacy ? createdAt : undefined),
    validFrom: finiteNumber(data.validFrom, entity, "validFrom", legacy ? createdAt : undefined),
    validUntil: optionalFiniteNumber(data.validUntil, entity, "validUntil"),
    status: enumValue(data.status, knowledgeStatuses, entity, "status", legacy ? "active" : undefined),
    supersededByFactId: optionalString(data.supersededByFactId),
  };
}

export function encodeOpenThread(thread: OpenThread) {
  const validated = decodeOpenThread({
    ...thread,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
  return { ...validated, schemaVersion: STORAGE_SCHEMA_VERSION };
}

export function decodeOpenThread(raw: unknown, expectedId?: string): OpenThread {
  const entity = expectedId ? `openThread/${expectedId}` : "openThread";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const createdAt = finiteNumber(data.createdAt, entity, "createdAt", legacy ? Date.now() : undefined);
  return {
    id: entityId(data, entity, expectedId, legacy),
    topic: requiredString(data.topic, entity, "topic"),
    summary: requiredString(data.summary, entity, "summary"),
    priority: boundedNumber(data.priority, entity, "priority", legacy ? 0.5 : undefined),
    sourceEventIds: stringArray(data.sourceEventIds, entity, "sourceEventIds", legacy ? [] : undefined),
    createdAt,
    updatedAt: finiteNumber(data.updatedAt, entity, "updatedAt", legacy ? createdAt : undefined),
    lastTouchedAt: finiteNumber(data.lastTouchedAt, entity, "lastTouchedAt", legacy ? createdAt : undefined),
    status: enumValue(
      data.status,
      threadStatuses,
      entity,
      "status",
      legacy ? (data.resolvedAt ? "resolved" : "open") : undefined,
    ),
    resolvedAt: optionalFiniteNumber(data.resolvedAt, entity, "resolvedAt"),
  };
}

export function encodeInitiative(initiative: CharacterInitiative) {
  const validated = decodeInitiative({
    ...initiative,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
  return { ...validated, schemaVersion: STORAGE_SCHEMA_VERSION };
}

export function decodeInitiative(raw: unknown, expectedId?: string): CharacterInitiative {
  const entity = expectedId ? `initiative/${expectedId}` : "initiative";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const createdAt = finiteNumber(data.createdAt, entity, "createdAt", legacy ? Date.now() : undefined);
  return {
    id: entityId(data, entity, expectedId, legacy),
    kind: enumValue(data.kind, initiativeKinds, entity, "kind", legacy ? "share_thought" : undefined),
    topic: requiredString(data.topic, entity, "topic"),
    reason: requiredString(data.reason, entity, "reason", legacy ? "legacy" : undefined),
    priority: boundedNumber(data.priority, entity, "priority", legacy ? 0.5 : undefined),
    createdAt,
    notBefore: finiteNumber(data.notBefore, entity, "notBefore", legacy ? createdAt : undefined),
    expiresAt: finiteNumber(data.expiresAt, entity, "expiresAt", legacy ? createdAt + 86_400_000 : undefined),
    status: enumValue(data.status, initiativeStatuses, entity, "status", legacy ? "pending" : undefined),
    dedupeKey: requiredString(data.dedupeKey, entity, "dedupeKey", legacy ? entityId(data, entity, expectedId, true) : undefined),
    sourceIds: stringArray(data.sourceIds, entity, "sourceIds", legacy ? [] : undefined),
  };
}

export interface MemoryProcessedMarker {
  eventId: string;
  timestamp: number;
  processorVersion: number;
}

export function encodeMemoryProcessedMarker(eventId: string, timestamp: number) {
  return {
    eventId,
    timestamp,
    processorVersion: MEMORY_PROCESSOR_VERSION,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  };
}

export function decodeMemoryProcessedMarker(raw: unknown, expectedId?: string): MemoryProcessedMarker {
  const entity = expectedId ? `memoryProcessed/${expectedId}` : "memoryProcessed";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const eventId = requiredString(
    data.eventId,
    entity,
    "eventId",
    legacy ? expectedId : undefined,
  );
  if (expectedId && eventId !== expectedId)
    throw new PersistenceSchemaError(entity, "eventId не совпадает с id документа");
  return {
    eventId,
    timestamp: finiteNumber(data.timestamp, entity, "timestamp"),
    processorVersion: safeInteger(
      data.processorVersion,
      entity,
      "processorVersion",
      legacy ? LEGACY_MEMORY_PROCESSOR_VERSION : undefined,
    ),
  };
}

export function isProcessedByCurrentVersion(raw: unknown, expectedId?: string) {
  return decodeMemoryProcessedMarker(raw, expectedId).processorVersion === MEMORY_PROCESSOR_VERSION;
}



export interface TurnPendingMarker {
  messageId: string;
  timestamp: number;
}

export function encodeTurnPendingMarker(messageId: string, timestamp: number) {
  return {
    messageId,
    timestamp,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  };
}

export function decodeTurnPendingMarker(
  raw: unknown,
  expectedId?: string,
): TurnPendingMarker {
  const entity = expectedId ? `turnPending/${expectedId}` : "turnPending";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const messageId = requiredString(
    data.messageId,
    entity,
    "messageId",
    legacy ? expectedId : undefined,
  );
  if (expectedId && messageId !== expectedId)
    throw new PersistenceSchemaError(entity, "messageId не совпадает с id документа");
  return {
    messageId,
    timestamp: finiteNumber(data.timestamp, entity, "timestamp"),
  };
}

export interface MemoryPendingMarker {
  eventId: string;
  timestamp: number;
}

export function encodeMemoryPendingMarker(eventId: string, timestamp: number) {
  return {
    eventId,
    timestamp,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  };
}

export function decodeMemoryPendingMarker(
  raw: unknown,
  expectedId?: string,
): MemoryPendingMarker {
  const entity = expectedId ? `memoryPending/${expectedId}` : "memoryPending";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const eventId = requiredString(
    data.eventId,
    entity,
    "eventId",
    legacy ? expectedId : undefined,
  );
  if (expectedId && eventId !== expectedId)
    throw new PersistenceSchemaError(entity, "eventId не совпадает с id документа");
  return {
    eventId,
    timestamp: finiteNumber(data.timestamp, entity, "timestamp"),
  };
}

export function encodeMemoryRecoveryState(state: MemoryRecoveryState) {
  const raw = {
    processorVersion: state.processorVersion,
    cursor: state.cursor,
    backfillComplete: state.backfillComplete,
    updatedAt: state.updatedAt,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  };
  decodeMemoryRecoveryState(raw);
  return raw;
}

export function decodeMemoryRecoveryState(raw: unknown): MemoryRecoveryState {
  const entity = "memoryMeta/recovery";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const cursorRaw = data.cursor;
  let cursor: MemoryRecoveryState["cursor"] = null;
  if (cursorRaw !== undefined && cursorRaw !== null) {
    const cursorData = record(cursorRaw, `${entity}.cursor`);
    cursor = {
      timestamp: finiteNumber(cursorData.timestamp, entity, "cursor.timestamp"),
      id: requiredString(cursorData.id, entity, "cursor.id"),
    };
  } else if (!legacy && cursorRaw === undefined) {
    throw new PersistenceSchemaError(entity, "отсутствует cursor");
  }
  const complete = data.backfillComplete;
  if (typeof complete !== "boolean" && !legacy)
    throw new PersistenceSchemaError(entity, "некорректное поле backfillComplete");
  return {
    processorVersion: safeInteger(
      data.processorVersion,
      entity,
      "processorVersion",
      legacy ? MEMORY_PROCESSOR_VERSION : undefined,
    ),
    cursor,
    backfillComplete: typeof complete === "boolean" ? complete : false,
    updatedAt: finiteNumber(
      data.updatedAt,
      entity,
      "updatedAt",
      legacy ? Date.now() : undefined,
    ),
  };
}

function decodeIntimacyScene(
  value: unknown,
  entity: string,
): IntimacyState["activeScene"] {
  if (value === undefined || value === null) return null;
  const data = record(value, `${entity}.activeScene`);
  const sceneId = requiredString(data.sceneId, entity, "activeScene.sceneId");
  const stageId = requiredString(data.stageId, entity, "activeScene.stageId");
  if (!isNeutralIntimacySceneId(sceneId))
    throw new PersistenceSchemaError(
      entity,
      "activeScene.sceneId должен быть нейтральным scene.private.* id",
    );
  if (!isNeutralIntimacyStageId(stageId))
    throw new PersistenceSchemaError(
      entity,
      "activeScene.stageId должен быть нейтральным stage.* id",
    );
  const poseId = optionalString(data.poseId);
  if (poseId && !isNeutralIntimacyPoseId(poseId))
    throw new PersistenceSchemaError(
      entity,
      "activeScene.poseId должен быть нейтральным pose.* id",
    );
  return {
    sceneId,
    stageId,
    poseId,
    privacy: enumValue(
      data.privacy,
      intimacyPrivacyLevels,
      entity,
      "activeScene.privacy",
    ),
    startedAt: finiteNumber(data.startedAt, entity, "activeScene.startedAt"),
    updatedAt: finiteNumber(data.updatedAt, entity, "activeScene.updatedAt"),
  };
}

export function encodeIntimacyState(state: IntimacyState) {
  const validated = decodeIntimacyState({
    ...state,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
  return { ...validated, schemaVersion: STORAGE_SCHEMA_VERSION };
}

export function decodeIntimacyState(raw: unknown): IntimacyState {
  const entity = "intimacy/state";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const fallback = createInitialIntimacyState(
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : Date.now(),
  );
  return {
    revision: safeInteger(data.revision, entity, "revision", legacy ? 0 : undefined),
    adultModeEnabled: booleanValue(
      data.adultModeEnabled,
      entity,
      "adultModeEnabled",
      legacy ? fallback.adultModeEnabled : undefined,
    ),
    phase: enumValue(
      data.phase,
      intimacyPhases,
      entity,
      "phase",
      legacy ? fallback.phase : undefined,
    ),
    interactionStatus: enumValue(
      data.interactionStatus,
      intimacyInteractionStatuses,
      entity,
      "interactionStatus",
      legacy ? fallback.interactionStatus : undefined,
    ),
    comfort: boundedNumber(
      data.comfort,
      entity,
      "comfort",
      legacy ? fallback.comfort : undefined,
    ),
    interest: boundedNumber(
      data.interest,
      entity,
      "interest",
      legacy ? fallback.interest : undefined,
    ),
    arousal: boundedNumber(
      data.arousal,
      entity,
      "arousal",
      legacy ? fallback.arousal : undefined,
    ),
    initiativeDrive: boundedNumber(
      data.initiativeDrive,
      entity,
      "initiativeDrive",
      legacy ? fallback.initiativeDrive : undefined,
    ),
    activeScene:
      data.activeScene === undefined && legacy
        ? null
        : decodeIntimacyScene(data.activeScene, entity),
    cooldownUntil: optionalFiniteNumber(data.cooldownUntil, entity, "cooldownUntil"),
    lastInteractionAt: optionalFiniteNumber(
      data.lastInteractionAt,
      entity,
      "lastInteractionAt",
    ),
    lastBoundaryAt: optionalFiniteNumber(data.lastBoundaryAt, entity, "lastBoundaryAt"),
    storagePolicy: enumValue(
      data.storagePolicy,
      intimacyStoragePolicies,
      entity,
      "storagePolicy",
      legacy ? fallback.storagePolicy : undefined,
    ),
    updatedAt: finiteNumber(
      data.updatedAt,
      entity,
      "updatedAt",
      legacy ? fallback.updatedAt : undefined,
    ),
  };
}

function decodeIntimacyPreference(
  raw: unknown,
  index: number,
  legacy: boolean,
): IntimacyPreference {
  const entity = `intimacy/preferences.items[${index}]`;
  const data = record(raw, entity);
  const createdAt = finiteNumber(
    data.createdAt,
    entity,
    "createdAt",
    legacy ? Date.now() : undefined,
  );
  return {
    id: requiredString(data.id, entity, "id"),
    topicKey: requiredString(data.topicKey, entity, "topicKey"),
    stance: enumValue(
      data.stance,
      intimacyPreferenceStances,
      entity,
      "stance",
      legacy ? "uncertain" : undefined,
    ),
    strength: boundedNumber(
      data.strength,
      entity,
      "strength",
      legacy ? 0.5 : undefined,
    ),
    confidence: boundedNumber(
      data.confidence,
      entity,
      "confidence",
      legacy ? 0.5 : undefined,
    ),
    origin: enumValue(
      data.origin,
      intimacyPreferenceOrigins,
      entity,
      "origin",
      legacy ? "learned" : undefined,
    ),
    sourceEventIds: stringArray(
      data.sourceEventIds,
      entity,
      "sourceEventIds",
      legacy ? [] : undefined,
    ),
    createdAt,
    updatedAt: finiteNumber(
      data.updatedAt,
      entity,
      "updatedAt",
      legacy ? createdAt : undefined,
    ),
    validFrom: finiteNumber(
      data.validFrom,
      entity,
      "validFrom",
      legacy ? createdAt : undefined,
    ),
    validUntil: optionalFiniteNumber(data.validUntil, entity, "validUntil"),
    supersededByPreferenceId: optionalString(data.supersededByPreferenceId),
  };
}

export function encodeIntimacyPreferences(
  preferences: IntimacyPreferencesDocument,
) {
  const validated = decodeIntimacyPreferences({
    ...preferences,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
  return { ...validated, schemaVersion: STORAGE_SCHEMA_VERSION };
}

export function decodeIntimacyPreferences(
  raw: unknown,
): IntimacyPreferencesDocument {
  const entity = "intimacy/preferences";
  const { data, legacy } = commonStoredEntity(raw, entity);
  const fallback = createInitialIntimacyPreferences(
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : Date.now(),
  );
  if (data.items !== undefined && !Array.isArray(data.items))
    throw new PersistenceSchemaError(entity, "items должен быть массивом");
  const items = (data.items ?? (legacy ? fallback.items : undefined)) as
    | unknown[]
    | undefined;
  if (!items)
    throw new PersistenceSchemaError(entity, "отсутствует items");
  const decoded = items.map((item, index) =>
    decodeIntimacyPreference(item, index, legacy),
  );
  if (new Set(decoded.map((item) => item.id)).size !== decoded.length)
    throw new PersistenceSchemaError(entity, "повторяющийся preference id");
  return {
    revision: safeInteger(data.revision, entity, "revision", legacy ? 0 : undefined),
    items: decoded,
    updatedAt: finiteNumber(
      data.updatedAt,
      entity,
      "updatedAt",
      legacy ? fallback.updatedAt : undefined,
    ),
  };
}
