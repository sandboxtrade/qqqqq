/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { CharacterCore } from "../character/character";
import type { EmotionalState } from "../emotions/emotions";
import type { OpenThread } from "../memory/model";
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

export async function refreshInitiatives(
  repository: CompanionRepository,
  character: CharacterCore,
  emotion: EmotionalState,
  relationship: RelationshipState,
  world: WorldState,
  now = Date.now(),
  romance?: RomanceState,
) {
  const [existing, threads] = await Promise.all([
    repository.listInitiatives(),
    repository.listOpenThreads({ statuses: ["open"], limit: 160 }),
  ]);

  const hoursSinceUser = Math.max(
    0,
    (now - world.lastUserInteractionAt) / HOUR,
  );
  const romanceAvailable = canInitiateRomance(character, emotion, relationship, world, romance, now);
  for (const initiative of existing) {
    if (initiative.status === "pending" && initiative.dedupeKey.startsWith("romance:") && !romanceAvailable) {
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
        shareable.summary,
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
    hoursSinceUser >= 8 &&
    relationship.closeness > 0.35 &&
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
    emotion.energy > 0.32 &&
    relationship.closeness > 0.3 &&
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

  if (
    emotion.curiosity > 0.72 &&
    !dedupe.has(`thought:${calendarDateKey(now, world.timeZone)}`)
  ) {
    additions.push(
      candidate(
        "share_thought",
        "Bring up a small thought or question of her own instead of waiting to be prompted.",
        "Her curiosity is high enough that she would plausibly introduce a topic herself.",
        0.32 + emotion.curiosity * 0.18,
        now,
        `thought:${calendarDateKey(now, world.timeZone)}`,
        [],
        1,
        16,
      ),
    );
  }

  if (hoursSinceUser >= 1 && canInitiateRomance(character, emotion, relationship, world, romance, now) &&
      !dedupe.has(`romance:${calendarDateKey(now, world.timeZone)}`)) {
    additions.push(candidate("affectionate_checkin", "Сказать, что ей приятно общаться с ним; лёгкий комплимент без давления, обещаний действий или смены образа.",
      "Warm relationship and current availability support a gentle romantic initiative.", 0.61, now,
      `romance:${calendarDateKey(now, world.timeZone)}`, [], 0, 2));
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

export function renderLocalInitiative(initiative: CharacterInitiative) {
  switch (initiative.kind) {
    case "continue_thread":
      return `Кстати, я всё ещё помню ту незакрытую тему: ${initiative.topic}`;
    case "share_world_event":
      return `У меня сегодня случилась одна мелочь, о которой почему-то хочется тебе рассказать.`;
    case "suggest_activity":
      return "У меня сейчас спокойный вечер. Я бы не отказалась что-нибудь посмотреть вместе.";
    case "affectionate_checkin":
      return "Ты куда-то пропал. Просто решила проверить, как ты.";
    case "share_thought":
      return "У меня тут появилась одна мысль. Потом напомни мне её не потерять.";
    case "ask_about_user":
      return "У меня к тебе есть один вопрос, который я давно не задавала.";
    default:
      return "Я сама хотела тебе кое-что сказать.";
  }
}
