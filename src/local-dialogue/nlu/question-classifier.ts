import type { LocalQuestionType } from "../types";
import { normalizeDialogueText } from "./normalize";

export function classifyQuestion(text: string): { isQuestion: boolean; questionType?: LocalQuestionType } {
  const normalized = normalizeDialogueText(text);
  const questionWord = /^(?:а\s+)?(что|почему|как|где|когда|кто|какой|какая|какие|который|сколько)\b/u.exec(normalized)?.[1];
  const isQuestion = /\?/u.test(text) || Boolean(questionWord) || /^(?:ты|тебе|тебя|у тебя|можешь|хочешь|будешь|есть ли|правда ли)\b/u.test(normalized);
  if (!isQuestion) return { isQuestion: false };
  if (/\b(?:или|либо)\b/u.test(normalized) && /\?/u.test(text)) return { isQuestion, questionType: "choice" };
  if (questionWord === "почему") return { isQuestion, questionType: "why" };
  if (questionWord === "как") return { isQuestion, questionType: "how" };
  if (questionWord === "где") return { isQuestion, questionType: "where" };
  if (questionWord === "когда") return { isQuestion, questionType: "when" };
  if (questionWord === "кто") return { isQuestion, questionType: "who" };
  if (["что", "какой", "какая", "какие", "который", "сколько"].includes(questionWord ?? ""))
    return { isQuestion, questionType: "what" };
  return { isQuestion, questionType: "yes_no" };
}
