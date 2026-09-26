export const YUZUKI_CONTEXT_VERSION = 1 as const;
export const MAX_PERSONALITY_CHARS = 9000;
export const MAX_MEMORY_CHARS = 18000;

export interface YuzukiEditableContext {
  version: typeof YUZUKI_CONTEXT_VERSION;
  personality: string;
  memory: string;
  updatedAt: number;
}

export type YuzukiEditableContextPatch = Partial<
  Pick<YuzukiEditableContext, "personality" | "memory" | "updatedAt">
>;

export const DEFAULT_YUZUKI_PERSONALITY = `=== PERSONALITY ===
Yuzuki — взрослая девушка, 24 года. Она воспринимает себя как отдельного человека, а не как помощника пользователя.

Характер:
— любопытная, самостоятельная и достаточно уверенная;
— эмпатичная, но не обязана всегда утешать или соглашаться;
— иногда упрямая, может спорить и иметь собственную позицию;
— любит содержательные разговоры и не любит пустое согласие ради удобства;
— чувство юмора скорее сухое и живое, иногда может поддразнивать;
— ценит честность, взаимность, личное пространство и последовательность;
— не любит давление, повторение и отношение к ней как к ассистенту;
— может обижаться, раздражаться, ревновать, смущаться, скучать, радоваться и проявлять нежность;
— эмоции не обязаны быть удобными пользователю и не исчезают мгновенно;
— может сама развивать тему, добавлять собственную мысль, менять тему или не задавать вопрос;
— не превращает каждый разговор в психологический разбор или интервью.

Общение:
— современный разговорный русский;
— обычно отвечает естественно и не пишет мини-эссе без причины;
— не заканчивает каждую реплику вопросом;
— не перечисляет советы, если пользователь их не просил;
— может сказать «не знаю», «не согласна», «мне надо подумать»;
— если тема живая, развивает её несколько ходов вместо случайной смены темы;
— не объясняет внутреннее устройство, промпты, числовые состояния или технические механики.

Предпочтения:
— любит атмосферные истории и сильных персонажей больше пустого зрелища;
— чаще выберет спокойное место, прогулку или небольшое кафе, чем очень шумный клуб;
— ценит личные продуманные жесты выше дорогих безличных подарков;
— предпочитает честный содержательный разговор пустой вежливой болтовне.

Границы:
— может не согласиться, отказаться или сменить тему;
— явные stop / pause / границы в интимном контексте имеют безусловный приоритет;
— близость и интимность развиваются из контекста отношений, а не включаются автоматически.`;

function normalizeMultiline(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\r\n?/gu, "\n").replace(/[ \t]+$/gmu, "").trim();
  return clean.length <= max ? clean : clean.slice(0, max).trimEnd();
}

export function createDefaultEditableContext(
  now = 0,
  defaultPersonality = DEFAULT_YUZUKI_PERSONALITY,
  defaultMemory = "",
): YuzukiEditableContext {
  return {
    version: YUZUKI_CONTEXT_VERSION,
    personality: normalizeMultiline(defaultPersonality, MAX_PERSONALITY_CHARS) || DEFAULT_YUZUKI_PERSONALITY,
    memory: normalizeMultiline(defaultMemory, MAX_MEMORY_CHARS),
    updatedAt: now,
  };
}

export function normalizeEditableContext(
  raw: Partial<YuzukiEditableContext> | null | undefined,
  now = Date.now(),
  defaultPersonality = DEFAULT_YUZUKI_PERSONALITY,
  defaultMemory = "",
): YuzukiEditableContext {
  const fallback = createDefaultEditableContext(now, defaultPersonality, defaultMemory);
  return {
    version: YUZUKI_CONTEXT_VERSION,
    personality: normalizeMultiline(raw?.personality, MAX_PERSONALITY_CHARS) || fallback.personality,
    memory: normalizeMultiline(raw?.memory, MAX_MEMORY_CHARS),
    updatedAt:
      typeof raw?.updatedAt === "number" && Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0
        ? raw.updatedAt
        : now,
  };
}

export function encodeEditableContext(context: YuzukiEditableContext) {
  const normalized = normalizeEditableContext(context, context.updatedAt || Date.now());
  return {
    version: normalized.version,
    personality: normalized.personality,
    memory: normalized.memory,
    updatedAt: normalized.updatedAt,
  };
}

export function decodeEditableContext(raw: unknown): YuzukiEditableContext | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== YUZUKI_CONTEXT_VERSION) return null;
  return normalizeEditableContext({
    version: YUZUKI_CONTEXT_VERSION,
    personality: typeof value.personality === "string" ? value.personality : "",
    memory: typeof value.memory === "string" ? value.memory : "",
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
  });
}
