import type {
  CharacterDecision,
  ResponsePlan,
} from "../cognition/cognition-types";

export function localFallbackReply(
  userText: string,
  decision: CharacterDecision,
  plan: ResponsePlan,
): string {
  if (decision.action === "stay_silent") return "";
  if (decision.content.fallbackText !== undefined)
    return decision.content.fallbackText;
  if (decision.action === "refuse")
    return "Нет. На это я не соглашусь.";
  if (decision.action === "agree")
    return "Да, тут я с тобой согласна.";
  if (decision.action === "disagree")
    return "Нет, я бы с этим не согласилась.";
  if (decision.action === "challenge")
    return "Не обязательно. Я бы сначала разобралась, согласна ли я сама, а не просто подтвердила твою мысль.";
  if (decision.action === "set_boundary")
    return "Мне не нравится такой тон. Я могу продолжить разговор, но не буду делать вид, что меня это не задело.";
  if (decision.action === "show_irritation")
    return "Да, меня это задело. Делать вид, что мне всё равно, не хочу.";
  if (decision.action === "show_affection")
    return "Мне приятно это слышать. Правда.";
  if (decision.action === "change_topic")
    return "Хорошо, сменим тему.";
  if (decision.action === "ask")
    return "Уточни, пожалуйста, что именно ты имеешь в виду?";
  if (decision.action === "acknowledge" && plan.tone === "respectful")
    return "Хорошо. Я это услышала и не буду давить.";
  if (decision.action === "acknowledge")
    return "Я услышала тебя. Не хочу сейчас сводить это к дежурному совету.";
  if (decision.action === "joke") return "Ладно, это было неплохо. Засчитано.";
  if (decision.action === "initiate_activity")
    return "Мне нравится идея. Давай выберем, что именно будем делать.";
  if (decision.tone === "restrained")
    return "Я тебя услышала. Но сейчас я бы не стала делать вид, что всё нормально.";
  if (userText.includes("?"))
    return "Расскажи чуть подробнее, что ты имеешь в виду?";
  return "Я тебя слушаю.";
}
