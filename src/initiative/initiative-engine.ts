import type { CharacterCore } from '../character/character-types';
import type { EmotionalState } from '../emotions/emotion-types';
import type { OpenThread } from '../memory/memory-types';
import type { RelationshipState } from '../relationship/relationship-types';
import type { CompanionRepository } from '../storage/repositories/interfaces';
import type { WorldState } from '../world/world-types';
import type { CharacterInitiative, InitiativeKind } from './initiative-types';

const HOUR = 3_600_000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

function makeInitiative(input: Omit<CharacterInitiative, 'id' | 'status'>): CharacterInitiative {
  return { ...input, id: crypto.randomUUID(), status: 'pending' };
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

function initiativeFromThread(thread: OpenThread, now: number): CharacterInitiative {
  const ageHours = Math.max(0, (now - thread.createdAt) / HOUR);
  return candidate(
    'continue_thread',
    thread.summary,
    'There is an unresolved subject she still remembers and may naturally return to.',
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
) {
  const [existing, threads] = await Promise.all([repository.listInitiatives(), repository.listOpenThreads()]);

  const hoursSinceUser = Math.max(0, (now - world.lastUserInteractionAt) / HOUR);
  for (const initiative of existing) {
    if (initiative.status === 'pending' && initiative.expiresAt <= now) {
      await repository.saveInitiative({ ...initiative, status: 'expired' });
      continue;
    }
    if (initiative.status === 'pending' && initiative.kind === 'affectionate_checkin' && hoursSinceUser < 1) {
      await repository.saveInitiative({ ...initiative, status: 'dismissed' });
    }
  }

  const pending = existing.filter((item) =>
    item.status === 'pending' &&
    item.expiresAt > now &&
    !(item.kind === 'affectionate_checkin' && hoursSinceUser < 1)
  );
  // Include surfaced items in deduplication so the same world event or thread cannot be resurfaced on every app open.
  const dedupe = new Set(existing.map((item) => item.dedupeKey));
  const additions: CharacterInitiative[] = [];

  const unresolved = threads.filter((thread) => thread.status === 'open').sort((a, b) => b.priority - a.priority)[0];
  if (unresolved && !dedupe.has(`thread:${unresolved.id}`)) additions.push(initiativeFromThread(unresolved, now));

  const shareable = [...world.recentEvents].reverse().find((event) => event.shareWorthiness >= 0.5);
  if (shareable && !dedupe.has(`world:${shareable.id}`)) {
    additions.push(candidate(
      'share_world_event',
      shareable.summary,
      'Something happened in her own day that is worth sharing if conversation opens naturally.',
      0.42 + shareable.shareWorthiness * 0.25,
      now,
      `world:${shareable.id}`,
      [shareable.id],
      0,
      30,
    ));
  }

  if (hoursSinceUser >= 8 && relationship.closeness > 0.35 && !dedupe.has(`checkin:${world.lastUserInteractionAt}`)) {
    additions.push(candidate(
      'affectionate_checkin',
      'Check in without guilt-tripping or making the absence about herself.',
      'There has been a meaningful pause and the relationship is familiar enough for a small initiative.',
      0.38 + relationship.closeness * 0.28 + world.connectionDrive * 0.16,
      now,
      `checkin:${world.lastUserInteractionAt}`,
      [],
      0,
      12,
    ));
  }

  if (
    world.timeOfDay === 'evening' &&
    world.availability !== 'occupied' &&
    emotion.energy > 0.32 &&
    relationship.closeness > 0.3 &&
    !dedupe.has(`activity:${new Date(now).toDateString()}`)
  ) {
    additions.push(candidate(
      'suggest_activity',
      'Suggest a low-pressure shared evening activity such as watching something or spending time together.',
      'Her current routine leaves room for shared time and she has enough energy to initiate it.',
      0.39 + character.immutableTraits.playfulness * 0.15,
      now,
      `activity:${new Date(now).toDateString()}`,
      [],
      0,
      8,
    ));
  }

  if (emotion.curiosity > 0.72 && !dedupe.has(`thought:${new Date(now).toDateString()}`)) {
    additions.push(candidate(
      'share_thought',
      'Bring up a small thought or question of her own instead of waiting to be prompted.',
      'Her curiosity is high enough that she would plausibly introduce a topic herself.',
      0.32 + emotion.curiosity * 0.18,
      now,
      `thought:${new Date(now).toDateString()}`,
      [],
      1,
      16,
    ));
  }

  for (const initiative of additions) await repository.saveInitiative(initiative);

  const all = [...pending, ...additions]
    .filter((item) => item.status === 'pending' && item.expiresAt > now)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  return all;
}

export async function getReadyInitiative(repository: CompanionRepository, now = Date.now()) {
  const initiatives = await repository.listInitiatives();
  return initiatives
    .filter((item) => item.status === 'pending' && item.notBefore <= now && item.expiresAt > now)
    .sort((a, b) => b.priority - a.priority)[0] ?? null;
}

export async function markInitiativeSurfaced(repository: CompanionRepository, initiative: CharacterInitiative) {
  await repository.saveInitiative({ ...initiative, status: 'surfaced' });
}

export function renderLocalInitiative(initiative: CharacterInitiative) {
  switch (initiative.kind) {
    case 'continue_thread':
      return `Кстати, я всё ещё помню ту незакрытую тему: ${initiative.topic}`;
    case 'share_world_event':
      return `У меня сегодня случилась одна мелочь, о которой почему-то хочется тебе рассказать.`;
    case 'suggest_activity':
      return 'У меня сейчас спокойный вечер. Я бы не отказалась что-нибудь посмотреть вместе.';
    case 'affectionate_checkin':
      return 'Ты куда-то пропал. Просто решила проверить, как ты.';
    case 'share_thought':
      return 'У меня тут появилась одна мысль. Потом напомни мне её не потерять.';
    case 'ask_about_user':
      return 'У меня к тебе есть один вопрос, который я давно не задавала.';
    default:
      return 'Я сама хотела тебе кое-что сказать.';
  }
}
