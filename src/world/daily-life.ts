import type { EmotionDelta } from "../emotions/emotion-types";
import type {
  WorldActivity,
  WorldEventSnapshot,
  WorldLocation,
} from "./world-types";
import { resolveRoutine } from "./time-engine";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

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
      "She got absorbed in something she was reading and kept thinking about one idea afterward.",
    emotionalEffect: { curiosity: 0.025, happiness: 0.008 },
    shareWorthiness: 0.56,
  },
  {
    kind: "small_win",
    activities: ["personal_project"],
    summary:
      "She made satisfying progress on a personal project and felt quietly pleased with herself.",
    emotionalEffect: { happiness: 0.025, irritation: -0.008 },
    shareWorthiness: 0.61,
  },
  {
    kind: "minor_annoyance",
    activities: ["errands", "cooking"],
    summary:
      "A small everyday inconvenience irritated her for a while, though it was not serious.",
    emotionalEffect: { irritation: 0.035, happiness: -0.012 },
    shareWorthiness: 0.38,
  },
  {
    kind: "outing",
    activities: ["walk"],
    summary:
      "She took a short walk to clear her head and came back a little calmer.",
    emotionalEffect: { anxiety: -0.018, irritation: -0.014, happiness: 0.012 },
    shareWorthiness: 0.46,
  },
  {
    kind: "outing",
    activities: ["cafe_break"],
    location: "cafe",
    summary:
      "She spent a little time at a café for a change of scenery and enjoyed the quiet break.",
    emotionalEffect: { happiness: 0.018, boredom: -0.025, curiosity: 0.008 },
    shareWorthiness: 0.54,
  },
  {
    kind: "routine",
    activities: ["music"],
    summary: "She put on music and let herself switch off for a bit.",
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
): WorldEventSnapshot | null {
  const routine = resolveRoutine(timestamp, timeZone);
  if (!routine.isAwake || ["waking_up", "breakfast"].includes(routine.activity))
    return null;

  const chance = routine.availability === "occupied" ? 0.42 : 0.3;
  if (deterministic01(timestamp, "event-chance") > chance) return null;

  const template = chooseTemplate(routine.activity, timestamp);
  if (!template) return null;

  return {
    id: `world_${Math.floor(timestamp / 3_600_000)}_${template.kind}`,
    at: Math.floor(timestamp / 3_600_000) * 3_600_000,
    kind: template.kind,
    summary: template.summary,
    location: template.location ?? routine.location,
    activity: routine.activity,
    emotionalEffect: template.emotionalEffect,
    shareWorthiness: clamp(template.shareWorthiness),
  };
}
