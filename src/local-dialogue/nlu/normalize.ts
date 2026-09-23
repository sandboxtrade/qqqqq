export function normalizeDialogueText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .replace(/[«»„“”]/gu, '"')
    .replace(/[‐‑‒–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}
