import type { CharacterCore } from "../character/character-types";
import type { EmotionalState } from "../emotions/emotion-types";
import type { RelationshipState } from "./relationship-types";
import type { WorldState } from "../world/world-types";
import type { CharacterDecision, ResponsePlan } from "../cognition/cognition-types";

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
