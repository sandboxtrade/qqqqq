import type { EmotionalState } from "../../emotions/emotion-types";
import type { RelationshipState } from "../../relationship/relationship-types";
import type {
  CharacterResponsePlan,
  DialogueAct,
  DialogueContext,
  DialogueGoal,
  LocalResponseLength,
} from "../types";
import { decisionActs, intentActs } from "./dialogue-act";

function dominantEmotion(emotion: EmotionalState) {
  const candidates = [
    ["irritated", emotion.irritation], ["sad", emotion.sadness], ["anxious", emotion.anxiety],
    ["affectionate", emotion.affection], ["curious", emotion.curiosity], ["happy", emotion.happiness],
    ["bored", emotion.boredom],
  ] as const;
  return [...candidates].sort((a, b) => b[1] - a[1])[0] ?? ["neutral", 0.5] as const;
}

function responseLength(length: "very_short" | "short" | "balanced" | "long"): LocalResponseLength {
  return length === "balanced" ? "medium" : length;
}

function goalFromActs(acts: readonly DialogueAct[]): DialogueGoal {
  if (acts.includes("SILENCE")) return "silence";
  if (acts.includes("REFUSE")) return "refuse";
  if (acts.includes("BOUNDARY")) return "set_boundary";
  if (acts.includes("COMFORT") || acts.includes("CARE")) return "comfort";
  if (acts.includes("TEASE") || acts.includes("FLIRT") || acts.includes("JOKE")) return "tease";
  if (acts.includes("ANSWER") || acts.includes("AGREE") || acts.includes("DISAGREE")) return "answer";
  if (acts.includes("CONTINUE_TOPIC") || acts.includes("REFER_MEMORY")) return "continue_topic";
  if (acts.includes("ASK") || acts.includes("CLARIFY")) return "ask";
  if (acts.includes("SHARE")) return "share";
  return "react";
}

function styleTones(context: DialogueContext) {
  const tones = new Set<string>([context.perception.tone, context.relationship.stage, context.character.communicationStyle.humor]);
  if (context.emotion.irritation > 0.48 || context.relationship.unresolvedTension > 0.46) tones.add("guarded");
  else if (context.emotion.sadness > 0.52 || context.emotion.anxiety > 0.55) tones.add("gentle");
  else if (context.relationship.closeness > 0.52 || context.emotion.affection > 0.58) tones.add("warm");
  else tones.add("neutral");
  if (context.perception.tone === "playful" || context.romance?.phase === "playful") tones.add("playful");
  return [...tones];
}


function contextualAnswer(context: DialogueContext): string | undefined {
  const current = (context.userText ?? "").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  const previous = (context.dialogueFrame.previousUserText ?? "").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  const preference = context.character.preferenceRules?.find((rule) =>
    rule.topicKeywords.some((keyword) => previous.includes(keyword.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е"))),
  );
  if (context.nlu.intent === "ask_followup" && preference && /(?:какие|какой|что|а ты|например)/u.test(current))
    return preference.fallbackText;
  if (context.nlu.intent === "ask_why" && preference)
    return `Потому что ${preference.reasons[0] ?? "мне это просто ближе"}.`;
  if (context.nlu.intent === "ask_why" && /(?:поссор|поруг|друг|подруг)/u.test(previous))
    return "Если ты про ссору — я не могу знать, почему он так сделал. Могу только предполагать по тому, что ты расскажешь.";
  return undefined;
}

function dedupeActs(acts: DialogueAct[]) {
  return [...new Set(acts)];
}

function mayAskQuestion(context: DialogueContext, acts: readonly DialogueAct[]) {
  if (acts.some((act) => ["SILENCE","REFUSE","BOUNDARY","GOOD_NIGHT","CHANGE_TOPIC"].includes(act))) return false;
  if (acts.includes("CLARIFY")) return true;
  if (context.nlu.intent === "unknown" && context.nlu.confidence < 0.5) return true;
  if (context.nlu.intent === "ask_for_support") return false;
  return context.dialogueFrame.turnsOnTopic < 5 && context.nlu.confidence >= 0.48 && context.perception.ambiguity < 0.7;
}

export function planLocalDialogue(
  context: DialogueContext,
  authoritativeText?: string,
): CharacterResponsePlan {
  const forced = decisionActs(context.decision);
  let acts = forced ?? intentActs(context.nlu);
  const optionalQuestion = context.responsePlan.questionMode === "direct" ||
    (context.responsePlan.questionMode === "optional" && context.decision.shouldAskFollowUp);
  if (optionalQuestion && mayAskQuestion(context, acts) && !acts.includes("CLARIFY")) acts = [...acts, "FOLLOW_UP"];
  if (context.nlu.intent === "return_after_absence" && ["close","deep"].includes(context.relationship.stage)) acts = [...acts, "MISS_USER"];
  acts = dedupeActs(acts);
  const [emotionName, emotionIntensity] = dominantEmotion(context.emotion);
  const semanticPayload: NonNullable<CharacterResponsePlan["semanticPayload"]> = {
    summary: context.decision.content.summary,
    continuation: context.dialogueFrame.previousUserText
      ? "Я всё ещё говорю о том, что было прямо перед этим."
      : "Я не потеряла нить разговора.",
  };
  const contextual = contextualAnswer(context);
  if (authoritativeText) semanticPayload.authoritativeText = authoritativeText;
  else if (contextual) semanticPayload.authoritativeText = contextual;
  if (context.decision.content.locked && context.decision.content.fallbackText !== undefined)
    semanticPayload.lockedText = context.decision.content.fallbackText;

  return {
    trigger: context.initiative ? "AUTONOMOUS_MESSAGE" : "USER_MESSAGE",
    sourceIntent: context.nlu.intent,
    dialogueActs: acts,
    goal: goalFromActs(acts),
    emotion: emotionName,
    emotionIntensity,
    tone: styleTones(context),
    relationshipLevel: context.relationship.stage,
    intimacyLevel: context.relationship.closeness,
    energy: context.emotion.energy,
    responseLength: responseLength(context.responsePlan.length),
    shouldAskQuestion: acts.includes("FOLLOW_UP") || acts.includes("CLARIFY"),
    topic: context.nlu.topic ?? context.dialogueFrame.currentTopic,
    semanticPayload,
    decision: context.decision,
    responsePlan: context.responsePlan,
  };
}

export function planAutonomousDialogue(context: DialogueContext): CharacterResponsePlan {
  const initiative = context.initiative;
  const kind = initiative?.kind;
  const acts: DialogueAct[] = kind === "continue_thread" ? ["REMEMBER","CONTINUE_TOPIC","SHARE"]
    : kind === "share_world_event" ? ["SHARE"]
      : kind === "suggest_activity" ? ["SHARE","ASK"]
        : kind === "affectionate_checkin" ? ["WELCOME_BACK","CARE"]
          : kind === "share_thought" ? ["SHARE","CURIOSITY"]
            : ["SHARE"];
  const [emotion, emotionIntensity] = dominantEmotion(context.emotion);
  return {
    trigger: "AUTONOMOUS_MESSAGE",
    sourceIntent: `initiative_${kind ?? "unknown"}`,
    dialogueActs: acts,
    goal: "share",
    emotion,
    emotionIntensity,
    tone: styleTones(context),
    relationshipLevel: context.relationship.stage,
    intimacyLevel: context.relationship.closeness,
    energy: context.emotion.energy,
    responseLength: "short",
    shouldAskQuestion: acts.includes("ASK"),
    topic: initiative?.topic,
    semanticPayload: { summary: initiative?.reason ?? "Share a small thought." },
    decision: context.decision,
    responsePlan: context.responsePlan,
  };
}
