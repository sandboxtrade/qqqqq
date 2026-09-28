/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import { applyEmotionDelta, type EmotionalState, type EmotionDelta } from "../emotions/emotions";

// ---- world-types.ts ----
export type TimeOfDay = "night" | "morning" | "day" | "evening";

export type WorldLocation =
  | "bedroom"
  | "living_room"
  | "kitchen"
  | "outside"
  | "cafe"
  | "unknown";

export type WorldActivity =
  | "sleeping"
  | "waking_up"
  | "breakfast"
  | "personal_project"
  | "reading"
  | "music"
  | "walk"
  | "cooking"
  | "errands"
  | "cafe_break"
  | "relaxing"
  | "chatting"
  | "idle";

export type Availability = "sleeping" | "free" | "occupied" | "resting";

const HOME_LOCATIONS = new Set<WorldLocation>(["bedroom", "living_room", "kitchen"]);

export function isHomeLocation(location: WorldLocation) {
  return HOME_LOCATIONS.has(location);
}

function homeSafeLocation(location: WorldLocation, fallback: WorldLocation = "living_room"): WorldLocation {
  return isHomeLocation(location) ? location : fallback;
}

export interface WorldEventSnapshot {
  id: string;
  at: number;
  kind: "routine" | "small_win" | "minor_annoyance" | "reflection" | "outing";
  summary: string;
  location: WorldLocation;
  activity: WorldActivity;
  emotionalEffect: EmotionDelta;
  shareWorthiness: number;
}

export interface WorldState {
  timeZone: string;
  currentLocation: WorldLocation;
  currentActivity: WorldActivity;
  timeOfDay: TimeOfDay;
  availability: Availability;
  isAwake: boolean;
  connectionDrive: number;
  lastSimulatedAt: number;
  lastUserInteractionAt: number;
  lastMeaningfulWorldEventAt?: number;
  recentEvents: WorldEventSnapshot[];
  updatedAt: number;
}

export interface WorldSimulationResult {
  world: WorldState;
  emotionDelta: EmotionDelta;
  generatedEvents: WorldEventSnapshot[];
}

const ACTIVE_CHAT_GRACE_MS = 2 * 60_000;
const SLEEP_CHAT_GRACE_MS = 10 * 60_000;

export function isActiveChatGraceActive(world: WorldState, now = Date.now()) {
  return Boolean(
    world.isAwake &&
      world.currentActivity === "chatting" &&
      now - world.lastUserInteractionAt >= 0 &&
      now - world.lastUserInteractionAt <= ACTIVE_CHAT_GRACE_MS,
  );
}

export function isSleepChatGraceActive(world: WorldState, now = Date.now()) {
  return Boolean(
    world.isAwake &&
      world.currentActivity === "chatting" &&
      now - world.lastUserInteractionAt >= 0 &&
      now - world.lastUserInteractionAt <= SLEEP_CHAT_GRACE_MS,
  );
}

// ---- time-engine.ts ----
const FALLBACK_TIME_ZONE = "UTC";

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function resolveSystemTimeZone() {
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return value && isValidTimeZone(value) ? value : FALLBACK_TIME_ZONE;
}

function zonedParts(timestamp: number, timeZone: string) {
  const zone = isValidTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
  };
}

export function getHourInTimeZone(timestamp: number, timeZone: string) {
  return zonedParts(timestamp, timeZone).hour;
}

export function calendarDateKey(timestamp: number, timeZone: string) {
  const parts = zonedParts(timestamp, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function resolveTimeOfDay(
  timestamp: number,
  timeZone: string,
): TimeOfDay {
  const hour = getHourInTimeZone(timestamp, timeZone);
  if (hour < 6) return "night";
  if (hour < 11) return "morning";
  if (hour < 18) return "day";
  return "evening";
}

export interface RoutineSlot {
  activity: WorldActivity;
  location: WorldLocation;
  availability: Availability;
  isAwake: boolean;
  targetEnergy: number;
}

function pick<T>(items: readonly T[], timestamp: number, salt: string): T {
  const bucket = Math.floor(timestamp / 3_600_000);
  let hash = 2166136261;
  const value = `${bucket}:${salt}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return items[Math.abs(hash) % items.length];
}

const ACTIVITY_DETAILS: Record<WorldActivity, readonly string[]> = {
  sleeping: ["сплю", "ещё сплю"],
  waking_up: ["только просыпаюсь и пытаюсь собрать мысли", "ещё прихожу в себя после сна"],
  breakfast: ["завтракаю и никуда пока не спешу", "сижу с завтраком и постепенно просыпаюсь"],
  personal_project: [
    "разбираю заметки по своему маленькому проекту и пытаюсь убрать из него лишнее",
    "ковыряюсь в своём проекте — сейчас как раз проверяю одну идею, которая вчера казалась очевидной",
    "сижу над своим проектом и пытаюсь довести одну сырую мысль до чего-то нормального",
  ],
  reading: [
    "читаю эссе про память и то, как люди со временем переписывают собственные воспоминания",
    "читаю длинную статью про то, почему люди редко меняют мнение сразу, даже когда слышат хороший аргумент",
    "читаю несколько коротких рассказов и пока больше всего зацепилась за один про случайную встречу двух незнакомых людей",
    "читаю текст про привычки и то, почему мозг так любит повторять знакомые сценарии",
  ],
  music: [
    "слушаю спокойный инди-плейлист и немного отключаю голову",
    "слушаю музыку без слов — сегодня почему-то так легче сосредоточиться",
    "перебираю старый плейлист и нашла пару треков, которые давно не включала",
  ],
  walk: [
    "гуляю без конкретного маршрута, просто проветриваю голову",
    "вышла немного пройтись и сейчас медленно возвращаюсь домой",
    "брожу по району без цели — мне иногда так проще разложить мысли",
  ],
  cooking: [
    "готовлю что-то простое и стараюсь не устроить на кухне маленькую катастрофу",
    "готовлю ужин — ничего сложного, просто хочется чего-то тёплого",
    "возюсь на кухне и импровизирую из того, что нашлось",
  ],
  errands: [
    "разбираюсь с мелкими делами, которые слишком долго откладывала",
    "закрываю несколько бытовых дел одно за другим",
    "разгребаю мелочи, чтобы они наконец перестали висеть в голове",
  ],
  cafe_break: [
    "сижу в кафе с напитком и просто меняю обстановку",
    "ненадолго засела в кафе — хотелось посидеть среди людей, но в своём мире",
    "сижу у окна в кафе и понемногу отдыхаю от всего остального",
  ],
  relaxing: [
    "отдыхаю и ничего полезного из себя не изображаю",
    "просто лежу и даю голове немного затихнуть",
    "устроила себе паузу без планов и обязательств",
  ],
  chatting: ["болтаю с тобой", "сейчас в основном с тобой и разговариваю"],
  idle: ["ничем конкретным не занята", "пока просто отдыхаю без особого плана"],
};

/**
 * Ephemeral, deterministic detail for the character's current activity. It is
 * intentionally derived from the already persisted WorldState instead of being
 * stored as a new field, so old saves and Firestore documents stay compatible.
 */
const CHARACTER_ACTIVITY_DETAILS: Partial<Record<string, Partial<Record<WorldActivity, readonly string[]>>>> = {
  yuzuki_v1: {
    personal_project: [
      "дорисовываю иллюстрацию и уже третий раз меняю одну и ту же деталь",
      "разбираю референсы для рисунка и пытаюсь наконец выбрать один вариант",
      "сижу с планшетом и доделываю эскиз, который вчера бросила на полпути",
    ],
    reading: [
      "читаю длинный текст про кино и периодически отвлекаюсь на заметки",
      "листала артбук и в итоге зависла на нескольких страницах дольше, чем собиралась",
    ],
  },
  mika_v1: {
    music: [
      "переслушиваю треки для вечернего плейлиста и слишком громко подпеваю",
      "включила музыку и параллельно перебираю одежду перед выходом",
    ],
    errands: [
      "ношуcь по мелким делам и уже пожалела, что решила закрыть всё за один день",
      "по пути забежала в пару мест и теперь наконец могу немного выдохнуть",
    ],
    cafe_break: [
      "засела в кофейне между делами и просто смотрю на людей вокруг",
      "пью холодный кофе и делаю вид, что никуда не опаздываю",
    ],
  },
  rin_v1: {
    reading: [
      "читаю рукопись и отмечаю места, где автор слишком сильно пытается объяснить очевидное",
      "дочитываю книгу в тишине и пока не решила, нравится она мне или раздражает",
      "разбираю текст по работе, но уже больше читаю из любопытства, чем из обязанности",
    ],
    cafe_break: [
      "сижу в тихом кафе у окна с чаем и книгой",
      "спряталась в маленьком кафе, где почти никто не разговаривает",
    ],
  },
  hina_v1: {
    reading: [
      "сижу с книгой и уже минут десять перечитываю одну и ту же страницу, потому что отвлеклась",
      "читаю понемногу и делаю заметки на полях стикерами",
    ],
    cafe_break: [
      "сижу в маленьком кафе с латте и пытаюсь не торопиться обратно",
      "зашла за кофе после дел и в итоге устроилась у окна",
    ],
    cooking: [
      "что-то пеку на кухне и очень надеюсь, что на этот раз ничего не пересушу",
      "возилась с десертом и теперь жду, получится ли он вообще",
    ],
    music: [
      "слушаю музыку в наушниках и разбираю фотографии в телефоне",
      "включила тихий плейлист и просто немного отдыхаю",
    ],
    relaxing: [
      "сижу дома с чаем и наконец никуда не спешу",
      "устроилась на диване с телефоном и лениво отдыхаю",
    ],
  },

  sasha_v1: {
    personal_project: [
      "доделываю задание для колледжа и параллельно отвлекаюсь на новый сервис, который только что нашла",
      "сижу над учебным проектом и уже успела поменять идею после того, как увидела более нормальный референс",
      "разбираю задание к паре и пытаюсь сделать его не как у всех",
    ],
    reading: [
      "листаю конспект после пар и заодно читаю про штуку, которую сегодня упомянули",
      "разбираю заметки с учёбы и опять ушла по ссылкам куда-то совсем в другую тему",
    ],
    music: [
      "слушаю новый релиз и пока пытаюсь понять, нравится мне или просто хорошо разогрели ожидание",
      "переключаю новые треки и уже сохранила пару штук себе",
    ],
    errands: [
      "еду после колледжа по делам и по пути успела зайти ещё в два места, которых вообще не было в плане",
      "бегаю между колледжем и мелкими делами, пока энергии почему-то ещё хватает",
    ],
    cafe_break: [
      "заскочила за кофе после пар и зависла в телефоне дольше, чем собиралась",
      "сижу в кофейне после колледжа и тестирую одну новую штуку, которую сегодня нашла",
    ],
    relaxing: [
      "валяюсь дома с телефоном и разбираю всё, что насохраняла за день",
      "наконец ничего не делаю, только листаю новинки и музыку",
    ],
  },
  lea_v1: {
    walk: [
      "иду куда глаза глядят и уже дважды свернула не туда",
      "гуляю по району и по дороге нашла место, в которое теперь хочу зайти",
    ],
    errands: [
      "пытаюсь закрыть пару учебных и бытовых дел, но постоянно отвлекаюсь",
      "бегаю по делам и опять делаю всё в странном порядке",
    ],
    music: [
      "слушаю музыку и выбираю, на какой концерт хочу в следующий раз",
      "переслушиваю один трек по кругу, потому что он почему-то сегодня идеально попал",
    ],
  },
  sofia_v1: {
    personal_project: [
      "правлю презентацию по работе и пытаюсь сократить её хотя бы на треть",
      "собираю материалы для запуска и раздражаюсь на мелочи, которые никто кроме меня не заметит",
      "заканчиваю рабочую задачу, которую хотела закрыть ещё час назад",
    ],
    cafe_break: [
      "вышла за кофе между задачами и специально не открываю ноутбук пару минут",
      "сижу в кафе после встречи и наконец никуда не тороплюсь",
    ],
  },
  eva_v1: {
    walk: [
      "гуляю с камерой без конкретной цели и иногда что-то снимаю",
      "вышла пройтись с фотоаппаратом и задержалась дольше, чем планировала",
    ],
    reading: [
      "листаю фотокнигу и отмечаю кадры, к которым потом хочу вернуться",
      "читаю интервью с фотографом и спорю с ним у себя в голове",
    ],
  },
  nora_v1: {
    reading: [
      "читаю про один старый архитектурный проект и уже полезла смотреть планы здания",
      "листала книгу по архитектуре и застряла на главе, которую вообще не собиралась читать",
    ],
    errands: [
      "закрываю несколько скучных дел, чтобы они не отравляли мне выходной",
      "разбираюсь с бытовыми вопросами и мечтаю поскорее закончить",
    ],
  },
  aiko_v1: {
    music: [
      "лежу с музыкой и перебираю фотографии с последнего вечера",
      "слушаю плейлист перед выходом и решаю, хочу ли вообще сегодня куда-то идти",
      "включила музыку погромче и выбираю, что надеть вечером",
    ],
    relaxing: [
      "валяюсь дома, листаю телефон и вообще никуда не спешу",
      "лежу на кровати и лениво решаю, чем хочу заняться дальше",
      "устроила себе час абсолютного безделья и пока он мне нравится",
    ],
    cafe_break: [
      "сижу в кафе с айс-кофе и наблюдаю за людьми",
      "зашла в кафе перед встречей и теперь специально тяну время",
    ],
    walk: [
      "гуляю по вечернему городу без маршрута",
      "вышла пройтись и теперь думаю, не свернуть ли куда-нибудь ещё",
    ],
  },
};

export function describeWorldActivityDetail(
  activity: WorldActivity,
  timestamp = Date.now(),
  characterId = "yuzuki_v1",
): string {
  const specific = CHARACTER_ACTIVITY_DETAILS[characterId]?.[activity];
  const options = specific?.length ? specific : ACTIVITY_DETAILS[activity];
  return pick(options, timestamp, `activity-detail:${characterId}:${activity}`);
}

interface RoutineWindow {
  start: number;
  end: number;
  activities: readonly WorldActivity[];
  location?: WorldLocation;
  availability?: Availability;
  targetEnergy: number;
}

const CHARACTER_ROUTINES: Record<string, readonly RoutineWindow[]> = {
  yuzuki_v1: [
    { start: 0, end: 7, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .85 },
    { start: 7, end: 8, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .42 },
    { start: 8, end: 10, activities: ["breakfast"], location: "kitchen", availability: "free", targetEnergy: .66 },
    { start: 10, end: 13, activities: ["personal_project", "reading"], availability: "occupied", targetEnergy: .72 },
    { start: 13, end: 15, activities: ["reading", "music", "relaxing"], targetEnergy: .66 },
    { start: 15, end: 18, activities: ["personal_project", "reading", "music"], targetEnergy: .58 },
    { start: 18, end: 21, activities: ["cooking", "music", "relaxing"], targetEnergy: .5 },
    { start: 21, end: 24, activities: ["reading", "music", "relaxing"], targetEnergy: .34 },
  ],
  mika_v1: [
    { start: 0, end: 2, activities: ["music", "relaxing"], targetEnergy: .42 },
    { start: 2, end: 9, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .86 },
    { start: 9, end: 10, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .48 },
    { start: 10, end: 12, activities: ["breakfast", "music"], targetEnergy: .7 },
    { start: 12, end: 16, activities: ["errands", "cafe_break", "music"], targetEnergy: .76 },
    { start: 16, end: 20, activities: ["walk", "errands", "cafe_break"], targetEnergy: .72 },
    { start: 20, end: 24, activities: ["music", "walk", "relaxing"], targetEnergy: .62 },
  ],
  rin_v1: [
    { start: 0, end: 7, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .84 },
    { start: 7, end: 8, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .4 },
    { start: 8, end: 10, activities: ["breakfast", "reading"], targetEnergy: .62 },
    { start: 10, end: 14, activities: ["reading"], targetEnergy: .68 },
    { start: 14, end: 17, activities: ["cafe_break", "reading"], targetEnergy: .62 },
    { start: 17, end: 20, activities: ["walk", "cooking"], targetEnergy: .54 },
    { start: 20, end: 24, activities: ["reading", "music", "relaxing"], targetEnergy: .36 },
  ],
  hina_v1: [
    { start: 0, end: 1, activities: ["reading", "music", "relaxing"], targetEnergy: .32 },
    { start: 1, end: 8, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .88 },
    { start: 8, end: 9, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .42 },
    { start: 9, end: 11, activities: ["breakfast", "music"], targetEnergy: .65 },
    { start: 11, end: 15, activities: ["reading", "errands", "cafe_break"], targetEnergy: .7 },
    { start: 15, end: 18, activities: ["cafe_break", "walk", "reading"], targetEnergy: .62 },
    { start: 18, end: 21, activities: ["cooking", "music", "relaxing"], targetEnergy: .5 },
    { start: 21, end: 24, activities: ["reading", "music", "relaxing"], targetEnergy: .36 },
  ],

  sasha_v1: [
    { start: 0, end: 1, activities: ["music", "relaxing"], targetEnergy: .46 },
    { start: 1, end: 8, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .88 },
    { start: 8, end: 9, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .5 },
    { start: 9, end: 10, activities: ["breakfast", "music"], targetEnergy: .72 },
    { start: 10, end: 15, activities: ["personal_project", "reading", "errands"], availability: "occupied", targetEnergy: .78 },
    { start: 15, end: 18, activities: ["cafe_break", "errands", "music"], targetEnergy: .74 },
    { start: 18, end: 21, activities: ["personal_project", "music", "relaxing"], targetEnergy: .68 },
    { start: 21, end: 24, activities: ["music", "walk", "relaxing"], targetEnergy: .56 },
  ],
  lea_v1: [
    { start: 0, end: 2, activities: ["music", "relaxing"], targetEnergy: .48 },
    { start: 2, end: 10, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .88 },
    { start: 10, end: 11, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .5 },
    { start: 11, end: 13, activities: ["breakfast", "music"], targetEnergy: .72 },
    { start: 13, end: 17, activities: ["errands", "walk", "cafe_break"], targetEnergy: .74 },
    { start: 17, end: 21, activities: ["walk", "music", "cafe_break"], targetEnergy: .68 },
    { start: 21, end: 24, activities: ["music", "relaxing", "walk"], targetEnergy: .5 },
  ],
  sofia_v1: [
    { start: 0, end: 6, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .84 },
    { start: 6, end: 7, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .45 },
    { start: 7, end: 9, activities: ["breakfast"], location: "kitchen", availability: "free", targetEnergy: .72 },
    { start: 9, end: 13, activities: ["personal_project", "errands"], targetEnergy: .8 },
    { start: 13, end: 15, activities: ["cafe_break", "errands"], targetEnergy: .68 },
    { start: 15, end: 19, activities: ["personal_project", "errands"], targetEnergy: .64 },
    { start: 19, end: 22, activities: ["cooking", "relaxing"], targetEnergy: .48 },
    { start: 22, end: 24, activities: ["reading", "relaxing"], targetEnergy: .34 },
  ],
  eva_v1: [
    { start: 0, end: 7, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .85 },
    { start: 7, end: 8, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .43 },
    { start: 8, end: 10, activities: ["breakfast", "relaxing"], targetEnergy: .64 },
    { start: 10, end: 14, activities: ["walk", "reading", "errands"], targetEnergy: .68 },
    { start: 14, end: 17, activities: ["cafe_break", "walk"], targetEnergy: .62 },
    { start: 17, end: 20, activities: ["cooking", "reading"], targetEnergy: .5 },
    { start: 20, end: 24, activities: ["relaxing", "reading", "music"], targetEnergy: .36 },
  ],
  nora_v1: [
    { start: 0, end: 6, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .84 },
    { start: 6, end: 7, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .44 },
    { start: 7, end: 9, activities: ["breakfast", "reading"], targetEnergy: .68 },
    { start: 9, end: 13, activities: ["reading", "errands"], targetEnergy: .7 },
    { start: 13, end: 16, activities: ["cafe_break", "errands"], targetEnergy: .64 },
    { start: 16, end: 20, activities: ["walk", "reading", "cooking"], targetEnergy: .52 },
    { start: 20, end: 23, activities: ["reading", "relaxing"], targetEnergy: .36 },
    { start: 23, end: 24, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .82 },
  ],
  aiko_v1: [
    { start: 0, end: 3, activities: ["music", "walk", "relaxing"], targetEnergy: .56 },
    { start: 3, end: 10, activities: ["sleeping"], location: "bedroom", availability: "sleeping", targetEnergy: .88 },
    { start: 10, end: 11, activities: ["waking_up"], location: "bedroom", availability: "resting", targetEnergy: .5 },
    { start: 11, end: 13, activities: ["breakfast", "relaxing"], targetEnergy: .68 },
    { start: 13, end: 16, activities: ["cafe_break", "music", "errands"], targetEnergy: .72 },
    { start: 16, end: 20, activities: ["errands", "walk", "music"], targetEnergy: .74 },
    { start: 20, end: 24, activities: ["music", "walk", "relaxing", "cafe_break"], targetEnergy: .66 },
  ],
};

function routineDefaults(activity: WorldActivity): Pick<RoutineSlot, "location" | "availability" | "isAwake"> {
  if (activity === "sleeping") return { location: "bedroom", availability: "sleeping", isAwake: false };
  if (activity === "waking_up") return { location: "bedroom", availability: "resting", isAwake: true };
  if (activity === "breakfast" || activity === "cooking") return { location: "kitchen", availability: "free", isAwake: true };
  if (activity === "walk" || activity === "errands") return { location: "outside", availability: "free", isAwake: true };
  if (activity === "cafe_break") return { location: "cafe", availability: "free", isAwake: true };
  if (activity === "personal_project") return { location: "bedroom", availability: "occupied", isAwake: true };
  if (activity === "relaxing") return { location: "living_room", availability: "resting", isAwake: true };
  return { location: "living_room", availability: "free", isAwake: true };
}

export function resolveRoutine(
  timestamp: number,
  timeZone: string,
  characterId = "yuzuki_v1",
): RoutineSlot {
  const hour = getHourInTimeZone(timestamp, timeZone);
  const windows = CHARACTER_ROUTINES[characterId] ?? CHARACTER_ROUTINES.yuzuki_v1;
  const window = windows.find((candidate) => hour >= candidate.start && hour < candidate.end);
  if (!window) {
    return { activity: "idle", location: "unknown", availability: "free", isAwake: true, targetEnergy: .5 };
  }
  const activity = pick(window.activities, timestamp, `routine:${characterId}:${window.start}-${window.end}`);
  const defaults = routineDefaults(activity);
  return {
    activity,
    location: window.location ?? defaults.location,
    availability: window.availability ?? defaults.availability,
    isAwake: window.availability === "sleeping" ? false : defaults.isAwake,
    targetEnergy: window.targetEnergy,
  };
}

export function clampElapsedMs(from: number, to: number, maxDays = 14) {
  const max = maxDays * 24 * 3_600_000;
  return Math.max(0, Math.min(to - from, max));
}

function monotonicNow() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : 0;
}

/**
 * Uses wall clock normally, but if the device clock moves behind persisted
 * state, continues forward from the persisted floor using a monotonic timer.
 * This keeps world time from freezing or moving backwards inside a session.
 */
export class StableWorldClock {
  private fallbackFloor = 0;
  private fallbackMono = 0;
  private last = 0;

  reset() {
    this.fallbackFloor = 0;
    this.fallbackMono = 0;
    this.last = 0;
  }

  now(
    minimum = 0,
    wallNow = Date.now(),
    monoNow = monotonicNow(),
  ) {
    let candidate = wallNow;

    if (candidate < minimum) {
      if (this.fallbackFloor < minimum || this.fallbackFloor === 0) {
        this.fallbackFloor = minimum;
        this.fallbackMono = monoNow;
      }
      candidate =
        this.fallbackFloor + Math.max(0, monoNow - this.fallbackMono);
    } else {
      this.fallbackFloor = 0;
      this.fallbackMono = monoNow;
    }

    candidate = Math.max(candidate, minimum, this.last);
    this.last = candidate;
    return candidate;
  }
}

export const worldClock = new StableWorldClock();

export function resetWorldClock() {
  worldClock.reset();
}

// ---- daily-life.ts ----
const clampWorldEvent = (value: number) => Math.max(0, Math.min(1, value));

function deterministic01(timestamp: number, salt: string) {
  const bucket = Math.floor(timestamp / (2 * 3_600_000));
  let hash = 5381;
  const input = `${bucket}:${salt}`;
  for (let index = 0; index < input.length; index += 1)
    hash = (hash * 33) ^ input.charCodeAt(index);
  return (Math.abs(hash >>> 0) % 10_000) / 10_000;
}

interface EventTemplate {
  kind: WorldEventSnapshot["kind"];
  activities: WorldActivity[];
  location?: WorldLocation;
  summary: string;
  emotionalEffect: EmotionDelta;
  shareWorthiness: number;
}

const templates: EventTemplate[] = [
  {
    kind: "reflection",
    activities: ["reading", "relaxing"],
    summary:
      "Я увлеклась чтением и потом ещё долго крутила в голове одну мысль.",
    emotionalEffect: { curiosity: 0.025, happiness: 0.008 },
    shareWorthiness: 0.56,
  },
  {
    kind: "small_win",
    activities: ["personal_project"],
    summary:
      "Я хорошо продвинулась в своём проекте и была тихо довольна собой.",
    emotionalEffect: { happiness: 0.025, irritation: -0.008 },
    shareWorthiness: 0.61,
  },
  {
    kind: "minor_annoyance",
    activities: ["errands", "cooking"],
    summary:
      "Меня ненадолго выбила из равновесия какая-то бытовая мелочь, хотя ничего серьёзного не случилось.",
    emotionalEffect: { irritation: 0.035, happiness: -0.012 },
    shareWorthiness: 0.38,
  },
  {
    kind: "outing",
    activities: ["walk"],
    summary:
      "Я немного прошлась, чтобы проветрить голову, и вернулась спокойнее.",
    emotionalEffect: { anxiety: -0.018, irritation: -0.014, happiness: 0.012 },
    shareWorthiness: 0.46,
  },
  {
    kind: "outing",
    activities: ["cafe_break"],
    location: "cafe",
    summary:
      "Я ненадолго выбралась в кафе ради смены обстановки и хорошо отдохнула в тишине.",
    emotionalEffect: { happiness: 0.018, boredom: -0.025, curiosity: 0.008 },
    shareWorthiness: 0.54,
  },
  {
    kind: "routine",
    activities: ["music"],
    summary: "Я включила музыку и ненадолго позволила себе просто отключиться от всего.",
    emotionalEffect: { irritation: -0.012, anxiety: -0.012 },
    shareWorthiness: 0.28,
  },
];

function chooseTemplate(activity: WorldActivity, timestamp: number) {
  const candidates = templates.filter((template) =>
    template.activities.includes(activity),
  );
  if (!candidates.length) return null;
  return candidates[
    Math.floor(deterministic01(timestamp, activity) * candidates.length) %
      candidates.length
  ];
}

export function maybeCreateWorldEvent(
  timestamp: number,
  timeZone: string,
  characterId = "yuzuki_v1",
): WorldEventSnapshot | null {
  const routine = resolveRoutine(timestamp, timeZone, characterId);
  if (!routine.isAwake || ["waking_up", "breakfast"].includes(routine.activity))
    return null;

  const chance = routine.availability === "occupied" ? 0.42 : 0.3;
  if (deterministic01(timestamp, `event-chance:${characterId}`) > chance) return null;

  const template = chooseTemplate(routine.activity, timestamp);
  if (!template) return null;

  return {
    id: `world_${characterId}_${Math.floor(timestamp / 3_600_000)}_${template.kind}`,
    at: Math.floor(timestamp / 3_600_000) * 3_600_000,
    kind: template.kind,
    summary: template.summary,
    location: template.location ?? routine.location,
    activity: routine.activity,
    emotionalEffect: template.emotionalEffect,
    shareWorthiness: clampWorldEvent(template.shareWorthiness),
  };
}

// ---- world-engine.ts ----
const HOUR = 3_600_000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function createInitialWorldState(
  now = Date.now(),
  timeZone = resolveSystemTimeZone(),
  characterId = "yuzuki_v1",
): WorldState {
  const routine = resolveRoutine(now, timeZone, characterId);
  return {
    timeZone,
    currentLocation: routine.location,
    currentActivity: routine.activity,
    timeOfDay: resolveTimeOfDay(now, timeZone),
    availability: routine.availability,
    isAwake: routine.isAwake,
    connectionDrive: 0.12,
    lastSimulatedAt: now,
    lastUserInteractionAt: now,
    recentEvents: [],
    updatedAt: now,
  };
}

function mergeDelta(target: EmotionDelta, incoming: EmotionDelta) {
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value !== "number") continue;
    const typed = key as keyof EmotionDelta;
    target[typed] = ((target[typed] as number | undefined) ?? 0) + value;
  }
}

function uniqueEvents(events: WorldEventSnapshot[]) {
  const map = new Map<string, WorldEventSnapshot>();
  for (const event of events) map.set(event.id, event);
  return [...map.values()].sort((a, b) => a.at - b.at);
}

export function simulateWorld(
  state: WorldState,
  emotion: EmotionalState,
  now = Date.now(),
  characterId = "yuzuki_v1",
): WorldSimulationResult {
  if (now <= state.lastSimulatedAt) {
    return { world: state, emotionDelta: {}, generatedEvents: [] };
  }

  const elapsed = clampElapsedMs(state.lastSimulatedAt, now);
  const simulationStart = now - elapsed;
  const elapsedHours = elapsed / HOUR;
  const generatedEvents: WorldEventSnapshot[] = [];
  const emotionDelta: EmotionDelta = {};

  // Sample a bounded number of points instead of simulating every minute/hour.
  const samples = Math.min(8, Math.max(1, Math.ceil(elapsedHours / 2)));
  const step = elapsed / samples;
  for (let index = 1; index <= samples; index += 1) {
    const at = simulationStart + step * index;
    const event = maybeCreateWorldEvent(at, state.timeZone, characterId);
    if (
      !event ||
      state.recentEvents.some((existing) => existing.id === event.id) ||
      generatedEvents.some((existing) => existing.id === event.id)
    )
      continue;
    generatedEvents.push(event);
    mergeDelta(emotionDelta, event.emotionalEffect);
  }

  const scheduledRoutine = resolveRoutine(now, state.timeZone, characterId);
  // During the sleep window, a conversation that already woke Yuzuki should
  // stay awake for a short grace period instead of being reset to sleeping on
  // every simulation tick. Once the user goes quiet, the normal sleep routine
  // takes over again automatically.
  const preserveActiveChat =
    scheduledRoutine.availability === "sleeping"
      ? isSleepChatGraceActive(state, now)
      : isActiveChatGraceActive(state, now);
  const currentRoutine: RoutineSlot = preserveActiveChat
    ? {
        activity: "chatting",
        location: homeSafeLocation(state.currentLocation, scheduledRoutine.location),
        availability: "free",
        isAwake: true,
        targetEnergy:
          scheduledRoutine.availability === "sleeping"
            ? Math.max(0.28, Math.min(0.42, emotion.energy))
            : scheduledRoutine.targetEnergy,
      }
    : scheduledRoutine;
  const targetEnergyAdjustment =
    (currentRoutine.targetEnergy - emotion.energy) *
    (1 - Math.exp(-0.16 * elapsedHours));
  emotionDelta.energy = (emotionDelta.energy ?? 0) + targetEnergyAdjustment;

  const hoursSinceUser = Math.max(
    0,
    (now - state.lastUserInteractionAt) / HOUR,
  );
  const desiredConnection = clamp(
    0.08 + Math.min(0.42, hoursSinceUser * 0.015),
  );
  const connectionDrive = clamp(
    state.connectionDrive +
      (desiredConnection - state.connectionDrive) *
        (1 - Math.exp(-elapsedHours / 6)),
  );

  if (elapsedHours > 8 && generatedEvents.length === 0) {
    emotionDelta.curiosity = (emotionDelta.curiosity ?? 0) + 0.008;
  }

  const recentEvents = uniqueEvents([
    ...state.recentEvents,
    ...generatedEvents,
  ]).slice(-6);
  const lastMeaningful = [...generatedEvents]
    .reverse()
    .find((event) => event.shareWorthiness >= 0.5);

  return {
    emotionDelta,
    generatedEvents,
    world: {
      ...state,
      currentLocation: currentRoutine.location,
      currentActivity: currentRoutine.activity,
      timeOfDay: resolveTimeOfDay(now, state.timeZone),
      availability: currentRoutine.availability,
      isAwake: currentRoutine.isAwake,
      connectionDrive,
      lastSimulatedAt: now,
      lastMeaningfulWorldEventAt:
        lastMeaningful?.at ?? state.lastMeaningfulWorldEventAt,
      recentEvents,
      updatedAt: now,
    },
  };
}

export function applyWorldSimulationEmotion(
  emotion: EmotionalState,
  simulation: WorldSimulationResult,
  now = Date.now(),
) {
  return applyEmotionDelta(emotion, simulation.emotionDelta, now);
}

export function markUserInteraction(
  world: WorldState,
  now = Date.now(),
  options: { engaged?: boolean } = {},
): WorldState {
  const engaged = options.engaged ?? true;

  if (!engaged) {
    return {
      ...world,
      currentLocation: homeSafeLocation(world.currentLocation),
      connectionDrive: Math.max(0.04, world.connectionDrive * 0.8),
      lastUserInteractionAt: now,
      updatedAt: now,
    };
  }

  if (world.availability === "occupied") {
    return {
      ...world,
      currentLocation: homeSafeLocation(world.currentLocation),
      connectionDrive: Math.max(0.04, world.connectionDrive * 0.5),
      lastUserInteractionAt: now,
      updatedAt: now,
    };
  }

  return {
    ...world,
    currentLocation: homeSafeLocation(world.currentLocation),
    currentActivity: "chatting",
    availability: "free",
    isAwake: true,
    connectionDrive: Math.max(0.04, world.connectionDrive * 0.35),
    lastUserInteractionAt: now,
    updatedAt: now,
  };
}
