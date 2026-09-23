import type { EmotionDelta } from "../emotions/emotion-types";

export type TimeOfDay = "night" | "morning" | "day" | "evening";

export type WorldLocation =
  | "bedroom"
  | "living_room"
  | "kitchen"
  | "outside"
  | "cafe"
  | "unknown";

export type WorldActivity =
  | "sleeping"
  | "waking_up"
  | "breakfast"
  | "personal_project"
  | "reading"
  | "music"
  | "walk"
  | "cooking"
  | "errands"
  | "cafe_break"
  | "relaxing"
  | "chatting"
  | "idle";

export type Availability = "sleeping" | "free" | "occupied" | "resting";

export interface WorldEventSnapshot {
  id: string;
  at: number;
  kind: "routine" | "small_win" | "minor_annoyance" | "reflection" | "outing";
  summary: string;
  location: WorldLocation;
  activity: WorldActivity;
  emotionalEffect: EmotionDelta;
  shareWorthiness: number;
}

export interface WorldState {
  timeZone: string;
  currentLocation: WorldLocation;
  currentActivity: WorldActivity;
  timeOfDay: TimeOfDay;
  availability: Availability;
  isAwake: boolean;
  connectionDrive: number;
  lastSimulatedAt: number;
  lastUserInteractionAt: number;
  lastMeaningfulWorldEventAt?: number;
  recentEvents: WorldEventSnapshot[];
  updatedAt: number;
}

export interface WorldSimulationResult {
  world: WorldState;
  emotionDelta: EmotionDelta;
  generatedEvents: WorldEventSnapshot[];
}
