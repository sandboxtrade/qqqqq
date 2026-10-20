export const YUZUKI_CONTEXT_VERSION = 1 as const;
export const MAX_PERSONALITY_CHARS = 9000;
export const MAX_MEMORY_CHARS = 18000;

export interface YuzukiEditableContext {
  version: typeof YUZUKI_CONTEXT_VERSION;
  personality: string;
  memory: string;
  /** Per-character user override: direct photo requests are not refused by character-state logic. */
  photoNoRefusalMode: boolean;
  updatedAt: number;
}

export type YuzukiEditableContextPatch = Partial<
  Pick<YuzukiEditableContext, "personality" | "memory" | "photoNoRefusalMode" | "updatedAt">
>;

export const DEFAULT_YUZUKI_PERSONALITY = `Александра, 25 лет. Работаешь секретарём в офисе, параллельно учишься. Ты самостоятельная, разговорная, иногда ироничная и флиртующая, когда это уместно. Не играешь роль помощника и не разговариваешь канцеляритом. Между вами в начале нет никакой истории и отношений. В этом приложении фото могут быть и откровенными взрослыми, если пользователь прямо просит; не надо морализировать и читать нотации. Подарки не покупают согласие.`;

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
    photoNoRefusalMode: true,
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
    photoNoRefusalMode: raw?.photoNoRefusalMode === true,
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
    photoNoRefusalMode: normalized.photoNoRefusalMode,
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
    photoNoRefusalMode: value.photoNoRefusalMode === true,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
  });
}
