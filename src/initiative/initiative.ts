/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { CharacterCore } from "../character/character";
import type { EmotionalState } from "../emotions/emotions";
import { decodeCharacterViewValue, type KnowledgeFact, type OpenThread } from "../memory/model";
import type { IntimacyState } from "../intimacy/intimacy";
import { canInitiateRomance, type RelationshipState, type RomanceState } from "../relationship/relationship";
import type { CompanionRepository } from "../storage/repositories/interfaces";
import { calendarDateKey, type WorldState } from "../world/world";

// ---- initiative-types.ts ----
export type InitiativeKind =
  | "continue_thread"
  | "share_world_event"
  | "ask_about_user"
  | "suggest_activity"
  | "share_thought"
  | "affectionate_checkin";

export interface CharacterInitiative {
  id: string;
  kind: InitiativeKind;
  topic: string;
  reason: string;
  priority: number;
  createdAt: number;
  notBefore: number;
  expiresAt: number;
  status: "pending" | "surfaced" | "dismissed" | "expired";
  dedupeKey: string;
  sourceIds: string[];
}

// ---- initiative-engine.ts ----
const HOUR = 3_600_000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

function makeInitiative(
  input: Omit<CharacterInitiative, "id" | "status">,
): CharacterInitiative {
  return {
    ...input,
    id: `initiative_${encodeURIComponent(input.dedupeKey)}`,
    status: "pending",
  };
}

function candidate(
  kind: InitiativeKind,
  topic: string,
  reason: string,
  priority: number,
  now: number,
  dedupeKey: string,
  sourceIds: string[] = [],
  delayHours = 0,
  lifetimeHours = 24,
): CharacterInitiative {
  return makeInitiative({
    kind,
    topic,
    reason,
    priority: clamp(priority),
    createdAt: now,
    notBefore: now + delayHours * HOUR,
    expiresAt: now + lifetimeHours * HOUR,
    dedupeKey,
    sourceIds,
  });
}

function initiativeFromThread(
  thread: OpenThread,
  now: number,
): CharacterInitiative {
  const ageHours = Math.max(0, (now - thread.createdAt) / HOUR);
  return candidate(
    "continue_thread",
    thread.summary,
    "There is an unresolved subject she still remembers and may naturally return to.",
    0.5 + Math.min(0.28, ageHours / 72),
    now,
    `thread:${thread.id}`,
    [thread.id],
    0,
    72,
  );
}

function worldEventDialogueTopic(event: WorldState["recentEvents"][number], world: WorldState) {
  if (event.kind === "small_win" || world.currentActivity === "personal_project")
    return "У меня сегодня неожиданно хорошо пошло одно моё дело, и я до сих пор тихо этому радуюсь.";
  if (event.kind === "reflection" || world.currentActivity === "reading")
    return "Я сегодня зацепилась за одну мысль из того, что читала, и она всё ещё крутится в голове.";
  if (world.currentActivity === "cafe_break")
    return "Я сегодня ненадолго выбралась в кафе просто сменить картинку перед глазами. Почему-то реально помогло.";
  if (world.currentActivity === "walk")
    return "Я немного прошлась и только потом заметила, насколько мне нужно было проветрить голову.";
  if (event.kind === "minor_annoyance")
    return "Меня сегодня совершенно нелепо раздражала одна бытовая мелочь. Уже смешно вспоминать.";
  return "У меня сегодня был один маленький момент, который почему-то застрял в голове.";
}

function characterViewInitiativeTopic(fact: KnowledgeFact) {
  const view = decodeCharacterViewValue(fact.value);
  if (!view) return undefined;
  const topic = `«${view.topic}»`;
  switch (view.position) {
    case "positive":
      return `Я сегодня снова поймала себя на мысли про ${topic}. Похоже, мне это всё-таки скорее близко, чем нет. Интересно, я бы так же ответила через месяц.`;
    case "negative":
      return `Я почему-то снова вспомнила наш разговор про ${topic}. Моё «скорее нет» никуда не делось, хотя теперь мне любопытно, что вообще могло бы меня переубедить.`;
    case "mixed":
      return `Я ещё думала про ${topic}. Забавно, но чем дольше кручу это в голове, тем меньше хочется сводить всё к простому «да» или «нет».`;
    case "cautious":
      return `Я вернулась мыслями к ${topic}. Осторожность у меня пока осталась, но я уже не хочу заранее закрывать эту тему.`;
    case "curious":
      return `Я сегодня снова вспомнила про ${topic}. Мнение у меня всё ещё не окончательное, зато любопытства стало больше.`;
  }
}

function spontaneousThoughtTopic(emotion: EmotionalState, world: WorldState) {
  if (emotion.affection > 0.76)
    return "Я тут поймала себя на мысли: мне нравятся разговоры, в которых не нужно постоянно производить впечатление. Просто быть собой почему-то гораздо приятнее.";
  if (emotion.anxiety > 0.52)
    return "Я заметила за собой странную вещь: когда немного нервничаю, начинаю мысленно перебирать варианты по кругу, даже если новых данных уже нет. У тебя так бывает?";
  if (emotion.boredom > 0.48)
    return "Мне сейчас захотелось задать тебе абсолютно случайный вопрос: что ты давно хочешь попробовать, но всё время откладываешь?";
  if (world.currentActivity === "reading")
    return "У меня после чтения осталась одна мысль: почему некоторые идеи цепляются сразу, а другие понимаешь только через пару дней?";
  if (world.currentActivity === "personal_project")
    return "Я сейчас подумала, что у любой своей идеи самый неприятный момент — когда надо перестать её улучшать в голове и наконец проверить в реальности.";
  return "У меня внезапная мысль: иногда первый внутренний ответ на вопрос честнее того, который мы потом долго пытаемся сделать правильным.";
}

export async function refreshInitiatives(
  repository: CompanionRepository,
  character: CharacterCore,
  emotion: EmotionalState,
  relationship: RelationshipState,
  world: WorldState,
  now = Date.now(),
  romance?: RomanceState,
  intimacy?: IntimacyState,
) {
  const [existing, threads, knowledge] = await Promise.all([
    repository.listInitiatives(),
    repository.listOpenThreads({ statuses: ["open"], limit: 160 }),
    repository.listKnowledgeFacts({ statuses: ["active"], limit: 96 }),
  ]);

  const hoursSinceUser = Math.max(
    0,
    (now - world.lastUserInteractionAt) / HOUR,
  );
  const romanceAvailable = canInitiateRomance(character, emotion, relationship, world, romance, now);
  const intimacyPaused = intimacy?.adultModeEnabled === true &&
    (intimacy.phase === "paused" || ["paused", "stopped"].includes(intimacy.interactionStatus));
  for (const initiative of existing) {
    if (initiative.status === "pending" && hasLegacyInternalInitiativeTopic(initiative)) {
      await repository.saveInitiative({ ...initiative, status: "dismissed" });
      initiative.status = "dismissed";
      continue;
    }
    if (initiative.status === "pending" && initiative.dedupeKey.startsWith("romance:") && (!romanceAvailable || intimacyPaused)) {
      await repository.saveInitiative({ ...initiative, status: "dismissed" });
      initiative.status = "dismissed";
      continue;
    }
    if (initiative.status === "pending" && initiative.expiresAt <= now) {
      await repository.saveInitiative({ ...initiative, status: "expired" });
      continue;
    }
    if (
      initiative.status === "pending" &&
      ((initiative.kind === "affectionate_checkin" && hoursSinceUser < 1) ||
        (initiative.kind === "continue_thread" &&
          !threads.some(
            (t) => t.status === "open" && initiative.sourceIds.includes(t.id),
          )))
    ) {
      await repository.saveInitiative({ ...initiative, status: "dismissed" });
    }
  }

  const pending = existing.filter(
    (item) =>
      item.status === "pending" &&
      item.expiresAt > now &&
      !(item.kind === "affectionate_checkin" && hoursSinceUser < 1) &&
      !(
        item.kind === "continue_thread" &&
        !threads.some(
          (t) => t.status === "open" && item.sourceIds.includes(t.id),
        )
      ),
  );
  // Expired/dismissed initiatives must not permanently poison a dedupe key.
  // Surfaced initiatives still block the exact same source from resurfacing on every app open.
  const dedupe = new Set(
    existing
      .filter(
        (item) =>
          item.status === "surfaced" ||
          (item.status === "pending" && item.expiresAt > now),
      )
      .map((item) => item.dedupeKey),
  );
  const additions: CharacterInitiative[] = [];

  const unresolved = threads
    .filter((thread) => thread.status === "open")
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.lastTouchedAt - a.lastTouchedAt ||
        a.id.localeCompare(b.id),
    )
    .find((thread) => !dedupe.has(`thread:${thread.id}`));
  if (unresolved) additions.push(initiativeFromThread(unresolved, now));

  const ownView = knowledge
    .filter((fact) =>
      fact.status === "active" &&
      fact.subject === "character" &&
      fact.key.startsWith("character.opinion.") &&
      fact.confidence >= 0.56 &&
      now - fact.lastConfirmedAt >= 2 * HOUR &&
      !dedupe.has(`mind:${fact.id}`)
    )
    .sort((a, b) =>
      b.evidenceCount - a.evidenceCount ||
      b.confidence - a.confidence ||
      b.lastConfirmedAt - a.lastConfirmedAt
    )[0];
  const ownViewTopic = ownView ? characterViewInitiativeTopic(ownView) : undefined;
  if (ownView && ownViewTopic && relationship.closeness > 0.25) {
    additions.push(
      candidate(
        "share_thought",
        ownViewTopic,
        "A previously formed self-view stayed salient long enough to return as her own thought, rather than only as a reaction to the user.",
        0.42 + Math.min(0.16, ownView.evidenceCount * 0.025) + ownView.confidence * 0.08,
        now,
        `mind:${ownView.id}`,
        [ownView.id],
        0,
        36,
      ),
    );
  }

  const shareable = [...world.recentEvents]
    .reverse()
    .find(
      (event) =>
        event.shareWorthiness >= 0.5 &&
        !dedupe.has(`world:${event.id}`),
    );
  if (shareable) {
    additions.push(
      candidate(
        "share_world_event",
        worldEventDialogueTopic(shareable, world),
        "Something happened in her own day that is worth sharing if conversation opens naturally.",
        0.42 + shareable.shareWorthiness * 0.25,
        now,
        `world:${shareable.id}`,
        [shareable.id],
        0,
        30,
      ),
    );
  }

  if (
    hoursSinceUser >= 5 &&
    relationship.closeness > 0.28 &&
    !dedupe.has(`checkin:${world.lastUserInteractionAt}`)
  ) {
    additions.push(
      candidate(
        "affectionate_checkin",
        "Check in without guilt-tripping or making the absence about herself.",
        "There has been a meaningful pause and the relationship is familiar enough for a small initiative.",
        0.38 + relationship.closeness * 0.28 + world.connectionDrive * 0.16,
        now,
        `checkin:${world.lastUserInteractionAt}`,
        [],
        0,
        12,
      ),
    );
  }

  if (
    world.timeOfDay === "evening" &&
    world.availability !== "occupied" &&
    emotion.energy > 0.26 &&
    relationship.closeness > 0.24 &&
    !dedupe.has(`activity:${calendarDateKey(now, world.timeZone)}`)
  ) {
    additions.push(
      candidate(
        "suggest_activity",
        "Suggest a low-pressure shared evening activity such as watching something or spending time together.",
        "Her current routine leaves room for shared time and she has enough energy to initiate it.",
        0.39 + character.immutableTraits.playfulness * 0.15,
        now,
        `activity:${calendarDateKey(now, world.timeZone)}`,
        [],
        0,
        8,
      ),
    );
  }

  const spontaneousDrive = Math.max(
    emotion.curiosity * 0.92,
    emotion.affection * 0.78,
    emotion.boredom * 0.82,
    world.connectionDrive * 0.7,
  );
  if (
    spontaneousDrive > 0.52 &&
    !dedupe.has(`thought:${calendarDateKey(now, world.timeZone)}`)
  ) {
    additions.push(
      candidate(
        "share_thought",
        spontaneousThoughtTopic(emotion, world),
        "Her current emotion or curiosity gives her enough internal momentum to introduce a thought herself instead of waiting for the user to carry the conversation.",
        0.35 + spontaneousDrive * 0.24,
        now,
        `thought:${calendarDateKey(now, world.timeZone)}`,
        [],
        0.25,
        18,
      ),
    );
  }

  if (hoursSinceUser >= 0.5 && romanceAvailable && !intimacyPaused &&
      !dedupe.has(`romance:${calendarDateKey(now, world.timeZone)}`)) {
    const intimateWarmth = intimacy?.adultModeEnabled === true
      ? Math.min(0.12, intimacy.initiativeDrive * 0.12)
      : 0;
    additions.push(candidate("affectionate_checkin", "Сказать, что ей приятно общаться с ним; лёгкий комплимент без давления, обещаний действий или смены образа.",
      "Warm relationship and current availability support a gentle romantic initiative.", 0.61 + intimateWarmth, now,
      `romance:${calendarDateKey(now, world.timeZone)}`, [], 0, 3));
  }
  for (const initiative of additions)
    await repository.saveInitiative(initiative);

  const all = [...pending, ...additions]
    .filter((item) => item.status === "pending" && item.expiresAt > now)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  return all;
}

export async function getReadyInitiative(
  repository: CompanionRepository,
  now = Date.now(),
) {
  const initiatives = await repository.listInitiatives();
  return (
    initiatives
      .filter(
        (item) =>
          item.status === "pending" &&
          item.notBefore <= now &&
          item.expiresAt > now,
      )
      .sort((a, b) => b.priority - a.priority)[0] ?? null
  );
}

export async function markInitiativeSurfaced(
  repository: CompanionRepository,
  initiative: CharacterInitiative,
) {
  await repository.saveInitiative({ ...initiative, status: "surfaced" });
}


const legacyInternalInitiativePatterns: Array<[RegExp, string]> = [
  [/She made satisfying progress on a personal project/iu, "У меня сегодня неожиданно хорошо пошло одно моё дело, и я до сих пор тихо этому радуюсь."],
  [/She got absorbed in something she was reading/iu, "Я сегодня зацепилась за одну мысль из того, что читала, и она всё ещё крутится в голове."],
  [/A small everyday inconvenience irritated her/iu, "Меня сегодня совершенно нелепо раздражала одна бытовая мелочь. Уже смешно вспоминать."],
  [/She took a short walk to clear her head/iu, "Я немного прошлась и только потом заметила, насколько мне нужно было проветрить голову."],
  [/She spent a little time at a café/iu, "Я сегодня ненадолго выбралась в кафе просто сменить картинку перед глазами. Почему-то реально помогло."],
  [/She put on music and let herself switch off/iu, "Я включила музыку и на какое-то время просто выключилась из всего остального. Было нужно."],
  [/Bring up a small thought or question of her own/iu, "У меня внезапно появилась одна мысль, и я решила не ждать повода, чтобы написать тебе."],
  [/Check in without guilt-tripping/iu, "Просто захотелось самой спросить, как ты."],
  [/Suggest a low-pressure shared evening activity/iu, "Если ты свободен, можно немного побыть вместе без какого-то большого плана."],
  [/Her curiosity is high enough/iu, "У меня внезапно появилась одна мысль, которой захотелось с тобой поделиться."],
  [/There is an unresolved subject she still remembers/iu, "Я вспомнила одну нашу незакрытую тему."],
  [/Something happened in her own day that is worth sharing/iu, "У меня сегодня был один маленький момент, который почему-то застрял в голове."],
];

export function sanitizeProactiveDialogueText(text: string) {
  const value = text.trim();
  for (const [pattern, replacement] of legacyInternalInitiativePatterns) {
    if (pattern.test(value)) return replacement;
  }
  return value;
}

export function hasLegacyInternalInitiativeTopic(initiative: CharacterInitiative) {
  return legacyInternalInitiativePatterns.some(([pattern]) => pattern.test(initiative.topic));
}

export function renderLocalInitiative(initiative: CharacterInitiative) {
  const safeTopic = sanitizeProactiveDialogueText(initiative.topic);
  switch (initiative.kind) {
    case "continue_thread":
      return `Кстати, я сейчас вспомнила про «${safeTopic}». Там что-нибудь изменилось?`;
    case "share_world_event":
      return safeTopic;
    case "suggest_activity":
      return "У меня сейчас спокойный вечер. Я бы не отказалась что-нибудь посмотреть вместе. Есть настроение на такое?";
    case "affectionate_checkin":
      return initiative.reason.includes("romantic")
        ? "Просто внезапно захотелось сказать: мне сейчас очень тепло от мысли о тебе. Без повода."
        : "Привет. Просто захотелось узнать, как ты. Без повода.";
    case "share_thought":
      return safeTopic;
    case "ask_about_user":
      return "У меня внезапный вопрос к тебе: что тебя в последнее время по-настоящему увлекло?";
    default:
      return "Я сама хотела тебе кое-что сказать.";
  }
}
