import type { CharacterEvent } from "../events/event-types";
import type { ChatMessage } from "./store";

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
