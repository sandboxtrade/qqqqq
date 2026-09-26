import { defaultCharacter } from "../character/character";
import { checkSignal } from "../core/async";
import type { CharacterEvent } from "../events/event-types";
import { getCompanionRepository } from "../storage/repository-factory";
import {
  formatConversationExport,
  type ConversationExportLimit,
  type ExportConversationLine,
} from "./conversation-export";

function exportLine(event: CharacterEvent): ExportConversationLine | null {
  if ((event.type !== "message" && event.type !== "character_action") || event.source === "system")
    return null;
  const payload = event.payload as { text?: unknown; silent?: unknown };
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const silent = event.source === "character" && payload?.silent === true;
  if ((!text && !silent) || (event.source !== "user" && event.source !== "character")) return null;
  return {
    id: event.id,
    role: event.source,
    text,
    timestamp: event.timestamp,
    proactive: event.type === "character_action",
    silent,
  };
}

export async function exportConversationText(
  uid: string | null,
  signal: AbortSignal | undefined,
  target: ConversationExportLimit,
) {
  const repository = getCompanionRepository(defaultCharacter.id, uid, signal);
  const wanted = target === "all" ? Number.POSITIVE_INFINITY : target;
  const collected = new Map<string, ExportConversationLine>();
  let before: { timestamp: number; id: string } | null = null;
  let hasMore = true;
  let safetyPages = 0;

  while (hasMore && collected.size < wanted && safetyPages < 500) {
    checkSignal(signal);
    const remaining = Number.isFinite(wanted) ? Math.max(1, wanted - collected.size) : 120;
    const page = await repository.listConversationEvents({
      before,
      limit: Math.min(120, remaining),
    });
    for (const event of page.events) {
      const line = exportLine(event);
      if (line && !line.silent && line.text.trim()) collected.set(line.id, line);
    }
    before = page.nextCursor;
    hasMore = page.hasMore && Boolean(before);
    safetyPages += 1;
    if (!page.events.length) break;
  }

  const ordered = [...collected.values()].sort(
    (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
  );
  const selected = target === "all" ? ordered : ordered.slice(-target);
  return formatConversationExport(selected);
}
