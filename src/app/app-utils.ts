/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { CharacterEvent } from "../events/event-types";
import { resolveRoutine, type WorldState } from "../world/world";
import type { ChatMessage } from "./store";

// ---- maintenance-policy.ts ----
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const RETRY_DELAYS = [5_000, 15_000, 30_000, 60_000, 120_000] as const;

export function maintenanceRetryDelay(attempt: number) {
  const index = Math.max(0, Math.min(RETRY_DELAYS.length - 1, Math.floor(attempt) - 1));
  return RETRY_DELAYS[index];
}

export function nextAwakeTimestamp(world: WorldState, from: number) {
  if (resolveRoutine(from, world.timeZone).isAwake) return from;
  // Routine boundaries are hour-based. Fifteen-minute sampling keeps the timer
  // bounded without requiring timezone arithmetic of our own.
  for (let offset = 15 * MINUTE; offset <= 30 * HOUR; offset += 15 * MINUTE) {
    const at = from + offset;
    if (resolveRoutine(at, world.timeZone).isAwake) return at;
  }
  return from + HOUR;
}

export function nextInitiativeCheckAt(
  world: WorldState,
  now: number,
) {
  // GPT decides whether she actually wants to write. The scheduler should only
  // give it enough chances to feel alive, instead of waiting a full hour before
  // the very first check.
  const firstCheck = world.lastUserInteractionAt + 5 * MINUTE;
  const quietFor = Math.max(0, now - world.lastUserInteractionAt);
  const cadence = quietFor < 2 * HOUR
    ? 15 * MINUTE
    : quietFor < 8 * HOUR
      ? 30 * MINUTE
      : HOUR;
  const target = now < firstCheck ? firstCheck : now + cadence;
  return nextAwakeTimestamp(world, Math.max(now, target));
}

// ---- message-sync.ts ----
export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(message.id, {
      ...existing,
      ...message,
      delivery:
        existing?.delivery === "pending" ||
        existing?.delivery === "failed" ||
        existing?.delivery === "skipped"
          ? existing.delivery
          : message.delivery ?? existing?.delivery ?? "saved",
    });
  }
  return [...byId.values()].sort(
    (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
  );
}

export function replyTargets(events: CharacterEvent[]): Set<string> {
  const targets = new Set<string>();
  for (const event of events) {
    if (event.type !== "message" || event.source !== "character") continue;
    const payload = event.payload as { inReplyTo?: unknown } | null;
    const target = String(payload?.inReplyTo ?? "").trim();
    if (target) targets.add(target);
  }
  return targets;
}

export function replyForFailedMessage(
  events: CharacterEvent[],
  failedMessageId: string | null,
): boolean {
  return failedMessageId ? replyTargets(events).has(failedMessageId) : false;
}
