const TECHNICAL_RE = /(?:\[object Object\]|undefined|null\b|(?:intent|template|dialogue)[_.:-][a-z0-9_]+|\{\{[^{}]+\}\})/iu;

export function postProcessDialogue(text: string): string {
  const cleaned = text
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/([!?.,])\1{1,}/gu, "$1")
    .replace(/\.\s*\./gu, ".")
    .replace(/\s+([…])/gu, "$1")
    .trim();
  if (!cleaned) return "";
  const first = cleaned.search(/[\p{L}\p{N}]/u);
  if (first < 0) return cleaned;
  return `${cleaned.slice(0, first)}${cleaned[first].toLocaleUpperCase("ru-RU")}${cleaned.slice(first + 1)}`;
}

export function isSafeRenderedText(text: string) {
  return !TECHNICAL_RE.test(text);
}

export function openingPhrase(text: string) {
  const normalized = text.trim();
  if (!normalized) return undefined;
  const match = normalized.match(/^(.{1,48}?)(?:[.!?…]|$)/u);
  return match?.[1]?.trim() || normalized.slice(0, 48);
}
