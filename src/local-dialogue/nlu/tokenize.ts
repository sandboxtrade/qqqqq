import { normalizeDialogueText } from "./normalize";

export function tokenizeDialogue(value: string): string[] {
  return normalizeDialogueText(value)
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.replace(/^-+|-+$/gu, ""))
    .filter(Boolean);
}

export function tokenStem(token: string): string {
  if (token.length <= 4) return token;
  return token.replace(
    /(?:иями|ями|ами|его|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ой|ую|юю|ам|ям|ах|ях|ом|ем|ов|ев|ы|и|а|я|у|ю|е|о)$/u,
    "",
  );
}
