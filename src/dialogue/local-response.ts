import type { CharacterDecision, ResponsePlan } from '../cognition/cognition-types';

export function localFallbackReply(userText: string, decision: CharacterDecision, plan: ResponsePlan): string {
  if (decision.action === 'challenge') return 'Не обязательно. Я бы сначала разобралась, согласна ли я сама, а не просто подтвердила твою мысль.';
  if (decision.action === 'set_boundary') return 'Мне не нравится такой тон. Я могу продолжить разговор, но не буду делать вид, что меня это не задело.';
  if (decision.action === 'show_affection') return 'Мне приятно это слышать. Правда.';
  if (decision.action === 'acknowledge' && plan.tone === 'respectful') return 'Хорошо. Я это услышала и не буду давить.';
  if (decision.action === 'acknowledge') return 'Я услышала тебя. Не хочу сейчас сводить это к дежурному совету.';
  if (decision.action === 'joke') return 'Ладно, это было неплохо. Засчитано.';
  if (decision.action === 'initiate_activity') return 'Мне нравится идея. Давай выберем, что именно будем делать.';
  if (decision.tone === 'restrained') return 'Я тебя услышала. Но сейчас я бы не стала делать вид, что всё нормально.';
  if (userText.includes('?')) return 'Я поняла вопрос. Я бы ответила прямо, но естественный языковой слой пока не подключён.';
  return 'Я здесь. Состояние, память и решение уже считаются локально; без Gemini эта реплика пока остаётся упрощённой.';
}
