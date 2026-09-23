/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { CharacterCore } from "../character/character";
import type { CharacterDecision, ResponsePlan } from "../cognition/cognition-types";
import type { EmotionalState } from "../emotions/emotions";
import type { WorldState } from "../world/world";

// ---- relationship-types.ts ----
export interface RelationshipState {
  trust: number;
  closeness: number;
  attachment: number;
  security: number;
  respect: number;
  unresolvedTension: number;
  stage: "new" | "familiar" | "close" | "deep";
  updatedAt: number;
}

export type RelationshipDelta = Partial<
  Omit<RelationshipState, "stage" | "updatedAt">
>;

// ---- relationship-engine.ts ----
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export const initialRelationshipState: RelationshipState = {
  trust: 0.3,
  closeness: 0.25,
  attachment: 0.18,
  security: 0.35,
  respect: 0.5,
  unresolvedTension: 0,
  stage: "new",
  updatedAt: Date.now(),
};

function resolveStage(state: RelationshipState): RelationshipState["stage"] {
  const score =
    state.trust * 0.3 +
    state.closeness * 0.35 +
    state.attachment * 0.2 +
    state.security * 0.15;
  if (score > 0.75) return "deep";
  if (score > 0.55) return "close";
  if (score > 0.35) return "familiar";
  return "new";
}

export function applyRelationshipDelta(
  state: RelationshipState,
  delta: RelationshipDelta,
  now = Date.now(),
): RelationshipState {
  const next = { ...state };
  const elapsedHours = Math.min(72, Math.max(0, now - state.updatedAt) / 3_600_000);
  if (elapsedHours > 0 && state.unresolvedTension < 0.2) {
    const calmFactor = 1 - state.unresolvedTension / 0.2;
    next.security = clamp(next.security + elapsedHours * 0.004 * calmFactor);
  }
  for (const [key, value] of Object.entries(delta)) {
    if (typeof value !== "number") continue;
    const typedKey = key as keyof RelationshipDelta;
    next[typedKey as keyof RelationshipState] = clamp(
      (next[typedKey as keyof RelationshipState] as number) + value,
    ) as never;
  }
  next.stage = resolveStage(next);
  next.updatedAt = now;
  return next;
}

// ---- romance.ts ----
export interface RomanceState {
  version: 1;
  phase: "neutral" | "playful" | "romantic" | "private" | "paused";
  pending: "quiet_time" | null;
  pendingUntil: number;
  cooldownUntil: number;
  updatedAt: number;
}
export function initialRomance(now = 0): RomanceState {
  return { version: 1, phase: "neutral", pending: null, pendingUntil: 0, cooldownUntil: 0, updatedAt: now };
}
export function decodeRomance(raw: unknown): RomanceState {
  if (!raw || typeof raw !== "object") throw new Error("Invalid romance state");
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || !["neutral", "playful", "romantic", "private", "paused"].includes(String(r.phase)) ||
      (r.pending !== null && r.pending !== "quiet_time") ||
      [r.pendingUntil, r.cooldownUntil, r.updatedAt].some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0))
    throw new Error("Invalid romance state");
  return { version: 1, phase: r.phase as RomanceState["phase"], pending: r.pending as RomanceState["pending"], pendingUntil: r.pendingUntil as number, cooldownUntil: r.cooldownUntil as number, updatedAt: r.updatedAt as number };
}
export function currentRomance(state: RomanceState | undefined, now: number): RomanceState {
  const next = { ...(state ?? initialRomance()) };
  if (now >= next.pendingUntil) next.pending = null;
  // Private moments are transient; a reload hours later must not resume them.
  if (now - next.updatedAt > 30 * 60_000 && next.phase !== "paused") {
    next.phase = "neutral"; next.pending = null;
  }
  return next;
}
export function canInitiateRomance(character: CharacterCore, emotion: EmotionalState, relationship: RelationshipState, world: WorldState, state: RomanceState | undefined, now: number) {
  const r = currentRomance(state, now);
  return character.adult && character.age >= 18 && r.phase !== "paused" && r.phase !== "private" &&
    now >= r.cooldownUntil && world.isAwake && ["free", "resting"].includes(world.availability) &&
    emotion.energy >= 0.35 && emotion.irritation < 0.3 && emotion.sadness < 0.55 &&
    relationship.trust >= 0.45 && relationship.closeness >= 0.4 && relationship.unresolvedTension < 0.3;
}
export function planRomance(input: {
  text: string; previous?: RomanceState; now: number; character: CharacterCore;
  emotion: EmotionalState; relationship: RelationshipState; world: WorldState;
  decision: CharacterDecision; plan: ResponsePlan;
}) {
  const { now, character, emotion, relationship, world } = input;
  const previous = currentRomance(input.previous, now);
  let state = { ...previous };
  let decision = input.decision;
  let plan = input.plan;
  let localText: string | undefined;
  let action = "none";
  const text = input.text.trim().toLowerCase().replace(/ё/g, "е");
  const stop =
    /^(?:нет(?:,?\s+не хочу)?|не сейчас|стоп(?:,?\s+пожалуйста)?|хватит(?:\s+уже)?|остановись|не надо(?:\s+продолжать)?|не продолжай|передумал|передумала)[.!… ]*$/u.test(text) ||
    /(?:не флиртуй|без флирта|не хочу флирт|перестань заигрывать|не надо продолжать|не хочу продолжать|давай сменим тему|давай просто поговорим)/u.test(text);
  const resume = /^(?:можно снова флиртовать|давай снова флиртовать|хочу снова флиртовать)[.! ]*$/u.test(text);
  const affection = /(?:ты (?:очень |такая )?(?:красивая|милая)|ты мне нравишься|люблю тебя|тебя люблю|давай пофлиртуем|хочу пофлиртовать)/u.test(text) && !/(?:не люблю|не нравишься|не хочу|не красивая)/u.test(text);
  const request = /^(?:давай|хочу|можем) (?:побыть вдвоем|побудем вдвоем|провести тихий вечер вдвоем|проведем тихий вечер вдвоем|побыть наедине|побудем наедине)[?!. ]*$/u.test(text);
  const yes = /^(?:да|давай|хочу|согласен|согласна)[!. ]*$/u.test(text);
  const finish = /^(?:вернемся к разговору|закончим тихий вечер|продолжим разговор)[!. ]*$/u.test(text);
  const eligible = canInitiateRomance(character, emotion, relationship, world, { ...previous, cooldownUntil: 0 }, now);
  const choose = (kind: string, next: RomanceState["phase"], reply: string, cue: ResponsePlan["visualCue"] = "warm") => {
    action = kind;
    state = { ...state, phase: next, updatedAt: now };
    localText = reply;
    decision = { ...decision, action: "acknowledge", tone: "warm_natural", shouldAskFollowUp: false,
      content: { mode: "social", stance: "neutral", summary: reply, reasons: ["Current romantic context"], locked: true, provenance: ["local_policy"], fallbackText: reply } };
    plan = { ...plan, intent: decision.action, tone: decision.tone, visualCue: cue, questionMode: "none", length: "short" };
  };
  // Boundaries are handled before availability, warmth or pending invitations.
  if (
    stop &&
    (previous.phase !== "neutral" || previous.pending !== null || /флирт|заигрыв/u.test(text))
  ) {
    choose("pause", "paused", "Хорошо, остановимся. Можем просто поговорить.", "neutral");
    state.pending = null; state.pendingUntil = 0; state.cooldownUntil = now + 60 * 60_000;
  } else if (resume) {
    choose("resume", "neutral", "Давай без спешки, как нам обоим будет комфортно.");
    state.pending = null; state.cooldownUntil = now;
  } else if (previous.phase === "private" && finish) {
    choose("return", "romantic", "Я рада, что мы побыли вдвоём. О чём хочешь поговорить?");
    state.pending = null; state.cooldownUntil = now + 60 * 60_000;
  } else if (!character.adult || character.age < 18 || previous.phase === "paused") {
    state.pending = null;
    if (previous.phase === "paused" && (affection || request))
      choose("keep_pause", "paused", "Давай пока просто поговорим. Если захочешь вернуться к флирту, скажи об этом прямо.", "neutral");
  } else if (["refuse", "set_boundary", "stay_silent", "change_topic"].includes(decision.action)) {
    state.pending = null;
  } else if (yes && previous.pending && now < previous.pendingUntil) {
    state.pending = null; state.pendingUntil = 0;
    if (eligible && ["bedroom", "living_room"].includes(world.currentLocation)) {
      choose("quiet_time", "private", "Давай побудем вдвоём. Без спешки и лишних слов.");
      state.cooldownUntil = now + 60 * 60_000;
    } else choose("not_now", "neutral", "Давай чуть позже, сейчас мне хочется немного пространства.", "neutral");
  } else if (decision.content.locked || ["refuse", "set_boundary", "stay_silent", "change_topic"].includes(decision.action)) {
    state.pending = null;
  } else if (request) {
    if (eligible && ["bedroom", "living_room"].includes(world.currentLocation)) {
      choose("invite", "romantic", "Мне тоже хочется тихого вечера вдвоём. Побудем рядом?");
      state.pending = "quiet_time"; state.pendingUntil = now + 5 * 60_000;
    } else choose("not_now", "neutral", "Мне приятно предложение, но сейчас я бы просто поговорила.", "neutral");
  } else if (affection && eligible) {
    choose("reciprocate", "playful", "Мне приятно это слышать. Ты тоже умеешь заставить меня улыбнуться.", "playful");
    state.pending = null;
  } else {
    // An unrelated message consumes an invitation; a later yes cannot accept it.
    state.pending = null;
    if (previous.phase === "private") state.phase = "romantic";
  }
  return { state, decision, plan, localText, action };
}
