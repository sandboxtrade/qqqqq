import type { ExtractedEntity } from "../types";
import { normalizeDialogueText } from "./normalize";

function entity(type: ExtractedEntity["type"], value: string, confidence = 0.8): ExtractedEntity {
  return { type, value, normalized: normalizeDialogueText(value), confidence };
}

export function extractEntities(text: string): ExtractedEntity[] {
  const normalized = normalizeDialogueText(text);
  const result: ExtractedEntity[] = [];
  const numberMatches = normalized.match(/\b\d{1,6}(?:[.,]\d+)?\b/gu) ?? [];
  for (const value of numberMatches.slice(0, 4)) result.push(entity("number", value, 0.98));

  const timeMatch = normalized.match(/\b(?:сегодня|завтра|вчера|утром|вечером|ночью|днем|днём)\b/gu) ?? [];
  for (const value of timeMatch.slice(0, 3)) result.push(entity("time", value, 0.94));

  const workMatch = /(?:на работе|в офисе|на смене|работаю\s+(?:в|на)\s+([\p{L}\p{N}_ -]{2,30}))/u.exec(normalized);
  if (workMatch) result.push(entity("work", workMatch[1] ?? workMatch[0], 0.76));

  const personMatches = [...text.matchAll(/(?:с|про|о)\s+([А-ЯЁ][а-яё]{2,20})/gu)].slice(0, 3);
  for (const match of personMatches) result.push(entity("person", match[1], 0.68));

  return result;
}
