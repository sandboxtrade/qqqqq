export type InitiativeKind =
  | "continue_thread"
  | "share_world_event"
  | "ask_about_user"
  | "suggest_activity"
  | "share_thought"
  | "affectionate_checkin";

export interface CharacterInitiative {
  id: string;
  kind: InitiativeKind;
  topic: string;
  reason: string;
  priority: number;
  createdAt: number;
  notBefore: number;
  expiresAt: number;
  status: "pending" | "surfaced" | "dismissed" | "expired";
  dedupeKey: string;
  sourceIds: string[];
}
