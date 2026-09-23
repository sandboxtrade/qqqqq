import { ENGINE_VERSION, SCHEMA_VERSION } from "../config/version";

export type EventType =
  | "message"
  | "character_action"
  | "gift"
  | "activity"
  | "relationship"
  | "world"
  | "intimacy";

export interface CharacterEvent<T = unknown> {
  id: string;
  type: EventType;
  source: "user" | "character" | "system";
  timestamp: number;
  payload: T;
  importance: number;
  schemaVersion: number;
  engineVersion: string;
}

export function createEvent<T>(
  input: Omit<
    CharacterEvent<T>,
    "id" | "timestamp" | "schemaVersion" | "engineVersion"
  > & { id?: string; timestamp?: number },
): CharacterEvent<T> {
  const { id = crypto.randomUUID(), timestamp = Date.now(), ...rest } = input;
  return {
    ...rest,
    id,
    timestamp,
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
  };
}
