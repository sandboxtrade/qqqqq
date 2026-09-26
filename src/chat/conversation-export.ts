export type ConversationExportLimit = 20 | 50 | 100 | 200 | "all";

export interface ExportConversationLine {
  id: string;
  role: "user" | "character";
  text: string;
  timestamp: number;
  proactive?: boolean;
  silent?: boolean;
}

function formatTime(timestamp: number) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
}

export function formatConversationExport(lines: readonly ExportConversationLine[]) {
  const visible = lines
    .filter((line) => !line.silent && line.text.trim())
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));

  return visible
    .map((line) => {
      const role = line.role === "user" ? "USER" : "YUZUKI";
      const initiative = line.proactive ? " · INITIATIVE" : "";
      return `[${formatTime(line.timestamp)}] ${role}${initiative}:\n${line.text.trim()}`;
    })
    .join("\n\n");
}
