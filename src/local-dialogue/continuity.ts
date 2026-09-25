/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import { analyzeLocalNLU, classifyTopic, normalizeDialogueForMatching, tokenizeDialogue, topicMatchScore } from "./nlu";
import type { CausalRelation, DialogueFrame, DialogueHistoryLine, LocalNLUResult, RetrospectiveContext } from "./types";

// ---- dialogue-frame.ts ----
function isQuestion(text: string) {
  return /\?\s*$/u.test(text.trim());
}

export function buildDialogueFrame(
  history: readonly DialogueHistoryLine[],
  current: LocalNLUResult,
): DialogueFrame {
  const recent = history.slice(-10);
  const userLines = recent.filter((line) => line.role === "user");
  const characterLines = recent.filter((line) => line.role === "character");
  const previousUser = userLines.at(-1);
  const previousUserBeforeLast = userLines.at(-2);
  const lastCharacter = characterLines.at(-1);
  const characterBeforeLast = characterLines.at(-2);
  const previousNLU = previousUser ? analyzeLocalNLU(previousUser.text) : undefined;
  const genericFrameTopics = new Set(["conversation", "social", "plans"]);
  const hintedCharacterTopic = lastCharacter?.conversationHint?.topic?.trim();
  const characterTopic = hintedCharacterTopic && !genericFrameTopics.has(hintedCharacterTopic)
    ? hintedCharacterTopic
    : undefined;
  const previousSurfaceTopic = previousUser ? classifyTopic(previousUser.text) : undefined;
  const previousFocusTopic = previousNLU?.semantic.focus ? classifyTopic(previousNLU.semantic.focus) : undefined;
  const previousUserTopic = previousNLU?.topic && !genericFrameTopics.has(previousNLU.topic)
    ? previousNLU.topic
    : previousFocusTopic ?? previousSurfaceTopic ?? previousNLU?.topic;
  const previousTopic = characterTopic ?? previousUserTopic;
  const currentFocusTopic = current.semantic.focus ? classifyTopic(current.semantic.focus) : undefined;
  const continuesConcretePrevious = Boolean(
    previousTopic &&
    !genericFrameTopics.has(previousTopic) &&
    topicMatchScore(current.semantic.focus ?? "", previousTopic) > 0
  );
  const currentTopic = current.topic && !genericFrameTopics.has(current.topic)
    ? current.topic
    : continuesConcretePrevious
      ? previousTopic
      : currentFocusTopic && !genericFrameTopics.has(currentFocusTopic)
        ? currentFocusTopic
        : current.topic ?? previousTopic;
  let turnsOnTopic = currentTopic ? 1 : 0;

  if (currentTopic) {
    const fillerTopics = new Set(["conversation", "social"]);
    for (const line of [...recent].reverse()) {
      const topic = classifyTopic(line.text);
      // Tiny acknowledgements and generic conversational glue should not erase
      // the active subject. Humans keep the thread through "угу", "наверное",
      // "ясно" and similar bridge turns.
      if (!topic || fillerTopics.has(topic)) continue;
      if (topic !== currentTopic) break;
      turnsOnTopic += 1;
    }
  }

  return {
    currentTopic,
    previousTopic,
    lastUserIntent: previousNLU?.intent,
    lastCharacterIntent: lastCharacter?.dialogueActs?.[0],
    pendingQuestion: lastCharacter && isQuestion(lastCharacter.text) ? lastCharacter.text : undefined,
    referencedEntities: current.entities.map((entity) => entity.normalized).slice(0, 8),
    turnsOnTopic: Math.min(turnsOnTopic, 20),
    previousUserText: previousUser?.text,
    previousUserTextBeforeLast: previousUserBeforeLast?.text,
    previousCharacterText: lastCharacter?.text,
    previousCharacterTextBeforeLast: characterBeforeLast?.text,
    lastCharacterTopic: hintedCharacterTopic || undefined,
    lastCharacterOpenThread: lastCharacter?.conversationHint?.openThread,
    lastCharacterContinuesPrevious: lastCharacter?.conversationHint?.continuesPrevious,
  };
}

// ---- topic-continuity.ts ----
const CONTEXTUAL_INTENTS = new Set([
  "ask_why",
  "ask_followup",
  "clarification_request",
  "reference_previous_topic",
  "short_yes",
  "short_no",
  "acknowledgement",
  "agreement",
  "disagreement",
  "uncertain",
  "user_dont_want",
]);

const GENERIC_TOPICS = new Set(["conversation", "plans"]);

export function resolveContinuityTopic(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
): string | undefined {
  if (nlu.topic && !GENERIC_TOPICS.has(nlu.topic)) return nlu.topic;
  if (CONTEXTUAL_INTENTS.has(nlu.intent))
    return frame.previousTopic ?? frame.currentTopic ?? nlu.topic;
  return nlu.topic;
}

// ---- causal / retrospective reasoning ------------------------------------
const RETROSPECTIVE_STOP_WORDS = new Set([
  "а", "и", "но", "ну", "да", "нет", "это", "этот", "эта", "эти", "то", "так", "там", "тут",
  "я", "ты", "он", "она", "они", "мы", "вы", "мне", "тебе", "меня", "тебя", "его", "ее", "её",
  "что", "как", "почему", "зачем", "где", "когда", "кто", "какой", "какая", "какие", "ли", "бы",
  "в", "во", "на", "к", "ко", "с", "со", "у", "о", "об", "от", "до", "за", "из", "для", "по",
]);
const GENERIC_RETROSPECTIVE_TOPICS = new Set(["conversation", "social", "plans", "character"]);
const RETROSPECTIVE_SHORT_RE = /^(?:(?:а|и|ну)\s+)?(?:почему|зачем|и\s+что|а\s+дальше|и\s+дальше|что\s+именно|в\s+смысле|про\s+что|что\s+ты\s+имеешь\s+в\s+виду|как\s+так|и\s+почему)[?.! ]*$/u;
const DEICTIC_LOW_CONTEXT_RE = /^(?:(?:а|и|ну)\s+)?(?:это|про\s+это|об\s+этом|с\s+этим|так|тогда|там|тот|та|те|он|она|они)(?:\s|$)/u;

function compactReasoningClause(value: string, max = 150) {
  const normalized = normalizeDialogueForMatching(value).replace(/^[,.;:!?\s-]+|[,.;:!?\s-]+$/gu, "").trim();
  if (!normalized) return "";
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trim()}…`;
}

function causalRelation(
  cause: string,
  effect: string,
  kind: CausalRelation["kind"],
  confidence: number,
  source?: DialogueHistoryLine,
): CausalRelation | null {
  const cleanCause = compactReasoningClause(cause);
  const cleanEffect = compactReasoningClause(effect);
  if (cleanCause.length < 2 || cleanEffect.length < 2 || cleanCause === cleanEffect) return null;
  return {
    cause: cleanCause,
    effect: cleanEffect,
    kind,
    confidence,
    sourceRole: source?.role,
    sourceTimestamp: source?.timestamp,
    sourceId: source?.id,
  };
}

/**
 * Extract only relations that are linguistically signalled by the speaker.
 * The local brain must not invent causality just because two events happened
 * close together.
 */
export function extractCausalRelations(text: string, source?: DialogueHistoryLine): CausalRelation[] {
  const value = normalizeDialogueForMatching(text);
  if (!value) return [];
  const result: CausalRelation[] = [];
  const add = (entry: CausalRelation | null) => { if (entry) result.push(entry); };

  // Forward chains are explicit: A -> therefore B -> because of that C.
  // Parse them hop-by-hop rather than collapsing the whole tail into one effect.
  const forwardParts = value.split(/\s+(поэтому|так\s+что|из-за\s+этого|вот\s+почему|в\s+итоге|и\s+теперь|после\s+этого)\s+/u);
  const hasForwardChain = forwardParts.length >= 3;
  if (hasForwardChain) {
    let cause = forwardParts[0];
    for (let index = 1; index + 1 < forwardParts.length; index += 2) {
      const connector = forwardParts[index];
      const effect = forwardParts[index + 1];
      const kind: CausalRelation["kind"] = /(?:в\s+итоге|и\s+теперь|после\s+этого)/u.test(connector)
        ? "temporal_consequence"
        : "consequence";
      add(causalRelation(cause, effect, kind, kind === "consequence" ? 0.96 : 0.8, source));
      cause = effect;
    }
  }

  // Backward chains: A because B because C => C -> B -> A.
  const backwardParts = value.split(/\s+(потому\s+что|так\s+как|из-за\s+того\s+что)\s+/u);
  const hasBackwardChain = backwardParts.length >= 3;
  if (hasBackwardChain) {
    const clauses = backwardParts.filter((_, index) => index % 2 === 0);
    for (let index = clauses.length - 1; index >= 1; index -= 1)
      add(causalRelation(clauses[index], clauses[index - 1], "cause", 0.97, source));
  }

  let match: RegExpExecArray | null;
  if (!hasBackwardChain) {
    match = /^(.{2,180}?)\s+(?:потому\s+что|так\s+как|из-за\s+того\s+что)\s+(.{2,180})$/u.exec(value);
    if (match) add(causalRelation(match[2], match[1], "cause", 0.97, source));
  }

  if (!hasForwardChain) {
    match = /^(.{2,180}?)\s+(?:поэтому|так\s+что|из-за\s+этого|вот\s+почему)\s+(.{2,180})$/u.exec(value);
    if (match) add(causalRelation(match[1], match[2], "consequence", 0.96, source));
  }

  match = /^(?:потому\s+что|так\s+как)\s+(.{2,180})$/u.exec(value);
  if (match && source) add(causalRelation(match[1], "предыдущая мысль", "cause", 0.82, source));

  match = /^(?:поэтому|так\s+что|из-за\s+этого|значит)\s+(.{2,180})$/u.exec(value);
  if (match && source) add(causalRelation("предыдущая мысль", match[1], "consequence", 0.8, source));

  match = /^если\s+(.{2,160}?)\s*,?\s+то\s+(.{2,160})$/u.exec(value);
  if (match) add(causalRelation(match[1], match[2], "condition", 0.95, source));

  match = /^(.{2,180}?)\s+(?:чтобы|для\s+того\s+чтобы)\s+(.{2,180})$/u.exec(value);
  if (match) add(causalRelation(match[2], match[1], "motivation", 0.84, source));

  if (!hasForwardChain) {
    match = /^(.{2,180}?)\s+(?:и\s+теперь|после\s+этого|в\s+итоге)\s+(.{2,180})$/u.exec(value);
    if (match) add(causalRelation(match[1], match[2], "temporal_consequence", 0.78, source));
  }

  const unique = new Map<string, CausalRelation>();
  for (const relation of result) {
    const key = `${relation.kind}|${relation.cause}|${relation.effect}`;
    const previous = unique.get(key);
    if (!previous || relation.confidence > previous.confidence) unique.set(key, relation);
  }
  return [...unique.values()];
}

export function buildCausalRelations(
  history: readonly DialogueHistoryLine[],
  currentText?: string,
): CausalRelation[] {
  const lines = [...history];
  if (currentText?.trim()) {
    const lastTimestamp = lines.at(-1)?.timestamp ?? Date.now();
    lines.push({ role: "user", text: currentText, timestamp: lastTimestamp + 1, id: "current-turn" });
  }
  const relations: CausalRelation[] = [];
  const previousByRole: Partial<Record<DialogueHistoryLine["role"], DialogueHistoryLine>> = {};
  for (const line of lines) {
    for (const raw of extractCausalRelations(line.text, line)) {
      const previous = previousByRole[line.role];
      const relation = {
        ...raw,
        cause: raw.cause === "предыдущая мысль" && previous
          ? compactReasoningClause(previous.text, 140)
          : raw.cause,
        effect: raw.effect === "предыдущая мысль" && previous
          ? compactReasoningClause(previous.text, 140)
          : raw.effect,
      };
      if (relation.cause !== "предыдущая мысль" && relation.effect !== "предыдущая мысль") relations.push(relation);
    }
    previousByRole[line.role] = line;
  }
  const unique = new Map<string, CausalRelation>();
  for (const relation of relations) {
    const key = `${relation.kind}|${relation.cause}|${relation.effect}`;
    const prior = unique.get(key);
    if (!prior || relation.confidence > prior.confidence) unique.set(key, relation);
  }
  return [...unique.values()].sort((a, b) => b.confidence - a.confidence || (b.sourceTimestamp ?? 0) - (a.sourceTimestamp ?? 0));
}

function contentTokens(value: string) {
  return tokenizeDialogue(value).filter((token) => token.length >= 3 && !RETROSPECTIVE_STOP_WORDS.has(token));
}

function overlapScore(query: readonly string[], text: string) {
  if (!query.length) return 0;
  const target = new Set(contentTokens(text));
  if (!target.size) return 0;
  let hits = 0;
  for (const token of query) if (target.has(token)) hits += 1;
  return hits / Math.max(2, Math.min(query.length, target.size));
}

function retrospectiveQueryTokens(nlu: LocalNLUResult, frame: DialogueFrame, currentText: string) {
  const parts = [nlu.semantic.focus, nlu.topic, currentText];
  const short = contentTokens(currentText).length <= 2 || RETROSPECTIVE_SHORT_RE.test(normalizeDialogueForMatching(currentText));
  if (short) parts.push(frame.previousUserText, frame.previousCharacterText, frame.previousUserTextBeforeLast);
  return [...new Set(contentTokens(parts.filter(Boolean).join(" ")))];
}

function relationRelevance(relation: CausalRelation, queryTokens: readonly string[]) {
  return Math.max(overlapScore(queryTokens, relation.cause), overlapScore(queryTokens, relation.effect));
}

export function shouldUseRetrospectivePass(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText: string,
) {
  const normalized = normalizeDialogueForMatching(currentText);
  const tokenCount = tokenizeDialogue(currentText).length;
  if (["memory_question", "ask_user_memory"].includes(nlu.intent)) return true;
  if (/(?:тогда|раньше|до этого|помнишь|мы\s+говорили|я\s+(?:говорил|говорила|рассказывал|рассказывала)|ты\s+(?:говорила|сказала))/u.test(normalized)) return true;
  if (isLikelyAdjacentCharacterTurn(nlu, frame, currentText) && nlu.confidence >= 0.64) return false;
  if (nlu.intent === "unknown" || nlu.confidence < 0.48) return true;
  if (CONTEXTUAL_INTENTS.has(nlu.intent) && !hasResolvableReference(nlu, frame)) return true;
  if (tokenCount <= 5 && RETROSPECTIVE_SHORT_RE.test(normalized) && !frame.previousCharacterText) return true;
  if (tokenCount <= 7 && DEICTIC_LOW_CONTEXT_RE.test(normalized) && !frame.previousTopic && !frame.currentTopic) return true;
  return false;
}

export function buildRetrospectiveContext(
  history: readonly DialogueHistoryLine[],
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText: string,
): RetrospectiveContext {
  const queryTokens = retrospectiveQueryTokens(nlu, frame, currentText);
  const topic = nlu.topic && !GENERIC_RETROSPECTIVE_TOPICS.has(nlu.topic) ? nlu.topic : frame.previousTopic ?? frame.currentTopic;
  const normalizedCurrent = normalizeDialogueForMatching(currentText);
  const asksWhy = nlu.questionType === "why" || /^(?:(?:а|и|ну)\s+)?(?:почему|зачем)/u.test(normalizedCurrent);
  const candidates = history
    .filter((line) => line.text.trim())
    .map((line, index) => {
      const lineTopic = classifyTopic(line.text);
      const lexical = overlapScore(queryTokens, line.text);
      const topicScore = topic && lineTopic ? topicMatchScore(line.text, topic) : 0;
      const causal = extractCausalRelations(line.text, line);
      const causalScore = causal.length
        ? Math.max(...causal.map((relation) => relationRelevance(relation, queryTokens)), asksWhy ? 0.34 : 0)
        : 0;
      const roleBonus = line.role === "user" ? 0.06 : 0.025;
      const recency = Math.min(0.1, ((index + 1) / Math.max(1, history.length)) * 0.1);
      const score = lexical * 0.62 + Math.min(0.3, topicScore * 0.18) + causalScore * 0.32 + roleBonus + recency;
      return { line, score, causal };
    })
    .filter((entry) => entry.score >= 0.18)
    .sort((a, b) => b.score - a.score || b.line.timestamp - a.line.timestamp);

  const evidence = candidates.slice(0, 7).map((entry) => entry.line);
  const relationPool = buildCausalRelations(history);
  const causalRelations = relationPool
    .map((relation) => ({ relation, score: relationRelevance(relation, queryTokens) + (asksWhy ? relation.confidence * 0.26 : 0) }))
    .filter((entry) => entry.score >= (asksWhy ? 0.2 : 0.28))
    .sort((a, b) => b.score - a.score || b.relation.confidence - a.relation.confidence)
    .slice(0, 6)
    .map((entry) => entry.relation);

  const best = candidates[0];
  const bestCausal = causalRelations[0];
  const inferredTopic = best ? classifyTopic(best.line.text) ?? topic : topic;
  const inferredFocus = best
    ? analyzeLocalNLU(best.line.text).semantic.focus ?? compactReasoningClause(best.line.text, 110)
    : bestCausal?.effect ?? bestCausal?.cause;
  const confidence = Math.max(
    best?.score ?? 0,
    bestCausal ? Math.min(0.94, bestCausal.confidence * 0.82 + relationRelevance(bestCausal, queryTokens) * 0.28) : 0,
  );
  const recovered = Boolean((best && best.score >= 0.34) || (bestCausal && confidence >= 0.52));
  const resolution: RetrospectiveContext["resolution"] = bestCausal && confidence >= 0.52
    ? "causal"
    : recovered
      ? "history"
      : "none";

  return {
    triggered: true,
    recovered,
    confidence: Math.min(0.98, confidence),
    resolution,
    inferredTopic,
    inferredFocus,
    scannedLines: history.length,
    evidence,
    causalRelations,
    summary: recovered
      ? bestCausal
        ? `Нашла в истории явную связь: «${bestCausal.cause}» → «${bestCausal.effect}».`
        : `Нашла более ранний контекст по теме «${inferredTopic ?? "разговора"}».`
      : undefined,
  };
}

export function applyRetrospectiveNLU(
  nlu: LocalNLUResult,
  retrospective: RetrospectiveContext | undefined,
  currentText: string,
): LocalNLUResult {
  if (!retrospective?.recovered) return nlu;
  const normalized = normalizeDialogueForMatching(currentText);
  const why = nlu.questionType === "why" || /^(?:(?:а|и|ну)\s+)?(?:почему|зачем)/u.test(normalized);
  const contextualShort = tokenizeDialogue(currentText).length <= 7 &&
    (RETROSPECTIVE_SHORT_RE.test(normalized) || DEICTIC_LOW_CONTEXT_RE.test(normalized));
  const intent = why
    ? "ask_why"
    : nlu.intent === "unknown" || contextualShort
      ? "reference_previous_topic"
      : nlu.intent;
  return {
    ...nlu,
    intent,
    topic: retrospective.inferredTopic ?? nlu.topic,
    confidence: Math.max(nlu.confidence, Math.min(0.88, 0.58 + retrospective.confidence * 0.3)),
    semantic: {
      ...nlu.semantic,
      focus: nlu.semantic.focus ?? retrospective.inferredFocus,
    },
  };
}

// ---- reference-resolver.ts ----
const CONTEXTUAL = new Set([
  "ask_why",
  "ask_followup",
  "clarification_request",
  "reference_previous_topic",
  "short_yes",
  "short_no",
  "acknowledgement",
  "agreement",
  "disagreement",
  "uncertain",
  "user_dont_want",
]);

const USER_STATE_INTENTS = new Set([
  "user_tired",
  "user_sad",
  "user_angry",
  "user_bored",
  "user_excited",
  "user_happy",
  "user_lonely",
  "user_stressed",
  "user_sleepy",
]);

const DEICTIC_CONTINUATION_RE = /^(?:(?:а|и|ну)\s+)?(?:это|там|туда|оттуда|тогда|так|с этим|про это|об этом|он|она|они|его|ее|её|их)(?:\s|$)/u;
const SELF_CONTAINED_SHORT_QUESTION_RE = /^(?:(?:а|и|ну)\s+)?(?:как\s+дела|как\s+ты|что\s+делаешь|чем\s+занимаешься|где\s+ты|сколько\s+времени|который\s+час)[?.! ]*$/u;
const ADJACENT_FRAGMENT_RE = /^(?:(?:а|и|ну|ой|мм)\s+)?(?:(?:в|в\s+каком|в\s+смысле|в\s+связи|про|насчёт|по)\s+.{1,70}|.{1,36})[?!. ]*$/u;

function isLikelyAdjacentCharacterTurn(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
) {
  if (!currentText || !frame.previousCharacterText) return false;
  const normalized = normalizeDialogueForMatching(currentText);
  const tokenCount = tokenizeDialogue(normalized).length;
  if (!normalized || tokenCount > 7 || SELF_CONTAINED_SHORT_QUESTION_RE.test(normalized)) return false;

  const characterTopic = frame.lastCharacterTopic ?? frame.previousTopic ?? frame.currentTopic;
  const currentConcreteTopic = nlu.topic && !GENERIC_RETROSPECTIVE_TOPICS.has(nlu.topic)
    ? nlu.topic
    : undefined;
  if (
    currentConcreteTopic &&
    characterTopic &&
    currentConcreteTopic !== characterTopic &&
    nlu.confidence >= 0.78 &&
    tokenCount >= 3
  ) return false;

  if (frame.pendingQuestion && !nlu.isQuestion && tokenCount <= 7) return true;
  if (CONTEXTUAL.has(nlu.intent)) return true;
  if (["unknown", "statement"].includes(nlu.intent) && ADJACENT_FRAGMENT_RE.test(normalized)) return true;
  if (nlu.isQuestion && tokenCount <= 4 && ADJACENT_FRAGMENT_RE.test(normalized)) return true;
  return false;
}

export function hasResolvableReference(nlu: LocalNLUResult, frame: DialogueFrame) {
  if (!CONTEXTUAL.has(nlu.intent)) return true;
  return Boolean(
    frame.currentTopic ||
    frame.previousTopic ||
    frame.pendingQuestion ||
    frame.previousUserText ||
    frame.previousCharacterText
  );
}

const CHARACTER_CERTAINTY_FOLLOWUP_RE = /^(?:(?:а|ну)\s+)?(?:(?:ты\s+)?(?:(?:прям|точно|вообще)\s+)?уверена(?:\s+в\s+этом)?|точно|правда|серьезно|реально)[?.! ]*$/u;

function resolveCharacterCertaintyFollowup(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !frame.previousCharacterText) return nlu;
  const normalized = normalizeDialogueForMatching(currentText);
  if (!CHARACTER_CERTAINTY_FOLLOWUP_RE.test(normalized)) return nlu;
  const previousWasOpinion = [
    "ask_character_opinion",
    "ask_character_preference",
    "ask_for_opinion",
  ].includes(frame.lastUserIntent ?? "");
  return {
    ...nlu,
    // Confirm the immediately preceding reply. If that reply followed an
    // opinion question, preserve the durable-opinion path; otherwise keep this
    // as a surface follow-up so a tiny "Точно?" cannot create a new stance.
    intent: previousWasOpinion ? "ask_character_opinion" : "ask_followup",
    topic: frame.previousTopic ?? frame.currentTopic ?? nlu.topic ?? "conversation",
    isQuestion: true,
    questionType: "yes_no",
    confidence: Math.max(nlu.confidence, 0.94),
    semantic: {
      ...nlu.semantic,
      subject: "character",
      stance: previousWasOpinion ? "ask_opinion" : "ask_fact",
      focus: previousWasOpinion
        ? nlu.semantic.focus
        : nlu.semantic.focus ?? frame.previousCharacterText,
      asksCharacterView: previousWasOpinion,
      reciprocal: true,
    },
  };
}

function resolveReciprocalQuestion(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !["ask_followup", "unknown", "statement"].includes(nlu.intent)) return nlu;
  const normalized = normalizeDialogueForMatching(currentText);
  if (!/^(?:а\s+)?(?:ты|тебе|у тебя|сама|сам)(?:\s+как)?[?.! ]*$/u.test(normalized)) return nlu;
  const previous = frame.lastUserIntent;
  if (previous && USER_STATE_INTENTS.has(previous)) {
    return {
      ...nlu,
      intent: "ask_character_state",
      topic: "character",
      isQuestion: true,
      questionType: "how",
      confidence: Math.max(nlu.confidence, 0.9),
    };
  }
  if (previous === "user_like" || previous === "user_dislike") {
    return {
      ...nlu,
      intent: "ask_character_preference",
      topic: "character",
      isQuestion: true,
      questionType: "what",
      confidence: Math.max(nlu.confidence, 0.86),
    };
  }
  if (previous === "share_work" || previous === "share_plan") {
    return {
      ...nlu,
      intent: "ask_character_activity",
      topic: "character",
      isQuestion: true,
      questionType: "what",
      confidence: Math.max(nlu.confidence, 0.84),
    };
  }
  return nlu;
}

function resolveDeicticContinuation(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText) return nlu;
  const normalized = normalizeDialogueForMatching(currentText);
  const tokenCount = normalized.split(/\s+/u).filter(Boolean).length;
  if (tokenCount > 10 || !DEICTIC_CONTINUATION_RE.test(normalized)) return nlu;
  const topic = frame.previousTopic ?? frame.currentTopic;
  if (!topic && !frame.previousUserText && !frame.previousCharacterText) return nlu;
  return {
    ...nlu,
    intent: ["statement", "unknown"].includes(nlu.intent) ? "reference_previous_topic" : nlu.intent,
    topic: topic ?? nlu.topic ?? "conversation",
    confidence: Math.max(nlu.confidence, 0.68),
  };
}




const CHARACTER_OPEN_LOOP_RE = /(?:вопрос|хочу\s+спросить|стало\s+интересно|мне\s+интересно|мне\s+любопытно|зацепил(?:о|ась)?|хочу\s+зацепиться|хочется\s+(?:понять|спросить))/u;
const OPEN_LOOP_FOLLOWUP_RE = /^(?:(?:а|и|ну)\s+)?(?:какой|какая|какие|что\s+за\s+(?:вопрос|мысль)|и\s+что|что\s+именно)[?.! ]*$/u;

function resolveCharacterOpenLoopFollowup(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !frame.previousCharacterText) return nlu;
  const current = normalizeDialogueForMatching(currentText);
  const previousCharacter = normalizeDialogueForMatching(frame.previousCharacterText);
  if (!OPEN_LOOP_FOLLOWUP_RE.test(current) || !CHARACTER_OPEN_LOOP_RE.test(previousCharacter)) return nlu;
  return {
    ...nlu,
    intent: "ask_followup",
    topic: frame.previousTopic ?? frame.currentTopic ?? nlu.topic ?? "conversation",
    isQuestion: true,
    questionType: "what",
    confidence: Math.max(nlu.confidence, 0.95),
    semantic: {
      ...nlu.semantic,
      subject: "character",
      stance: "ask_fact",
      reciprocal: true,
    },
  };
}

const RECIPROCAL_DESIRE_RE = /^(?:(?:а|и|ну)\s+)?(?:(?:ты\s+)?тоже\s+хочешь(?:\s+меня)?|ты\s+меня\s+хочешь|хочешь\s+меня|а?\s*ты\s+тоже)[?.! ]*$/u;
const PREVIOUS_DIRECTED_DESIRE_RE = /(?:я\s+тебя\s+хочу|хочу\s+тебя|меня\s+к\s+тебе\s+тянет|мне\s+тебя\s+хочется)/u;

function resolveReciprocalDesireQuestion(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !frame.previousUserText) return nlu;
  const current = normalizeDialogueForMatching(currentText);
  const previousUser = normalizeDialogueForMatching(frame.previousUserText);
  if (!RECIPROCAL_DESIRE_RE.test(current) || !PREVIOUS_DIRECTED_DESIRE_RE.test(previousUser)) return nlu;
  return {
    ...nlu,
    intent: "ask_relationship",
    topic: "relationship",
    isQuestion: true,
    questionType: "yes_no",
    confidence: Math.max(nlu.confidence, 0.96),
    semantic: {
      ...nlu.semantic,
      subject: "character",
      stance: "ask_opinion",
      asksCharacterView: true,
      reciprocal: true,
      intimacy: {
        ...nlu.semantic.intimacy,
        intimacyContext: true,
      },
    },
  };
}

const ACTIVITY_DETAIL_FOLLOWUP_RE = /^(?:(?:а|и|ну)\s+)?(?:что\s+читаешь|какую\s+(?:книгу|статью)\s+читаешь|что\s+слушаешь|что\s+готовишь|над\s+чем\s+(?:работаешь|сидишь)|что\s+за\s+проект|где\s+гуляешь|куда\s+гуляешь|что\s+за\s+музыку)[?.! ]*$/u;
const CHARACTER_ACTIVITY_CUE_RE = /(?:читаю|слушаю\s+музыку|готовлю|занимаюсь\s+(?:своим\s+)?проектом|работаю\s+над|гуляю|сижу\s+в\s+кафе|разбираюсь\s+с\s+делами)/u;

function resolveCharacterActivityDetailFollowup(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !frame.previousCharacterText) return nlu;
  const current = normalizeDialogueForMatching(currentText);
  const previousCharacter = normalizeDialogueForMatching(frame.previousCharacterText);
  if (!ACTIVITY_DETAIL_FOLLOWUP_RE.test(current) || !CHARACTER_ACTIVITY_CUE_RE.test(previousCharacter)) return nlu;
  return {
    ...nlu,
    intent: "ask_character_activity",
    topic: "character",
    isQuestion: true,
    questionType: "what",
    confidence: Math.max(nlu.confidence, 0.95),
    semantic: {
      ...nlu.semantic,
      subject: "character",
      stance: "ask_fact",
      reciprocal: true,
    },
  };
}


const ELLIPTICAL_CHARACTER_FOLLOWUP_RE = /^(?:(?:а|и|ну)\s+)?(?:где|когда|с\s+кем|кто|как|зачем)[ ]*$/u;

function resolveEllipticalCharacterFollowup(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !frame.previousCharacterText) return nlu;
  const current = normalizeDialogueForMatching(currentText);
  if (!ELLIPTICAL_CHARACTER_FOLLOWUP_RE.test(current)) return nlu;
  const questionType = current.includes("где") ? "where"
    : current.includes("когда") ? "when"
      : current.includes("кто") || current.includes("с кем") ? "who"
        : current.includes("как") ? "how"
          : current.includes("зачем") ? "why"
            : "what";
  return {
    ...nlu,
    intent: questionType === "why" ? "ask_why" : "ask_followup",
    topic: frame.previousTopic ?? frame.currentTopic ?? nlu.topic ?? "conversation",
    isQuestion: true,
    questionType,
    confidence: Math.max(nlu.confidence, 0.9),
    semantic: {
      ...nlu.semantic,
      subject: "character",
      stance: "ask_fact",
      reciprocal: true,
    },
  };
}

const CHARACTER_REPLY_META_QUESTION_RE = /^(?:(?:а|ну)\s+)?(?:(?:что\s+(?:именно\s+)?(?:интересно|странно|смешно|мило|важно|неожиданно|зацепило))|(?:что\s+именно)|(?:в\s+смысле)|(?:ты\s+про\s+что)|(?:про\s+что\s+ты)|(?:что\s+ты\s+имеешь\s+в\s+виду))[?.! ]*$/u;

function resolveCharacterReplyReference(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !frame.previousCharacterText) return nlu;
  const normalized = normalizeDialogueForMatching(currentText);
  if (!CHARACTER_REPLY_META_QUESTION_RE.test(normalized)) return nlu;
  return {
    ...nlu,
    intent: "clarification_request",
    topic: frame.previousTopic ?? frame.currentTopic ?? nlu.topic ?? "conversation",
    isQuestion: true,
    questionType: "what",
    confidence: Math.max(nlu.confidence, 0.94),
  };
}


function resolveContextualIntimacy(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText) return nlu;
  const normalized = normalizeDialogueForMatching(currentText);
  const priorAct = frame.lastCharacterIntent;
  const intimatePrior = priorAct && [
    "INTIMACY_APPROACH", "INTIMACY_RECIPROCATE", "INTIMACY_CHECKIN", "INTIMACY_PAUSE", "INTIMACY_AFTERCARE",
  ].includes(priorAct);
  if (!intimatePrior) return nlu;

  if (/(?:просто\s+обними|побудь\s+(?:со\s+мной|рядом)|полежи\s+рядом|не\s+уходи)/u.test(normalized)) {
    return {
      ...nlu,
      confidence: Math.max(nlu.confidence, 0.9),
      semantic: {
        ...nlu.semantic,
        intimacy: { kind: "aftercare", strength: 0.8, explicit: true, intimacyContext: true },
      },
    };
  }
  if (nlu.semantic.intimacy.kind !== "none") return nlu;

  // The same sentence can be ordinary in isolation and meaningful inside an
  // already intimate exchange. Continuity may add context, but never invents
  // consent without a fresh current-turn cue.
  if (/^(?:мне\s+это\s+нравится|мне\s+нравится|мне\s+хорошо|так\s+хорошо|хочу\s+дальше)[.! ]*$/u.test(normalized)) {
    return {
      ...nlu,
      confidence: Math.max(nlu.confidence, 0.9),
      semantic: {
        ...nlu.semantic,
        intimacy: { kind: "consent", strength: 0.86, explicit: true, intimacyContext: true },
      },
    };
  }
  if (/^(?:не\s+знаю|я\s+не\s+знаю|не\s+уверен(?:а)?|я\s+сомневаюсь|мне\s+неловко)[.! ]*$/u.test(normalized)) {
    return {
      ...nlu,
      confidence: Math.max(nlu.confidence, 0.92),
      semantic: {
        ...nlu.semantic,
        intimacy: { kind: "hesitant", strength: 0.84, explicit: true, intimacyContext: true },
      },
    };
  }

  if (/^(?:да|давай|хочу|можно|продолжай|угу|ага)[.! ]*$/u.test(normalized)) {
    return {
      ...nlu,
      confidence: Math.max(nlu.confidence, 0.9),
      semantic: {
        ...nlu.semantic,
        intimacy: {
          kind: priorAct === "INTIMACY_PAUSE" ? "resume" : "consent",
          strength: 0.9,
          explicit: true,
          intimacyContext: true,
        },
      },
    };
  }
  if (/^(?:нет|неа|не хочу|не надо|стоп|хватит)[.! ]*$/u.test(normalized)) {
    return {
      ...nlu,
      confidence: Math.max(nlu.confidence, 0.94),
      semantic: {
        ...nlu.semantic,
        intimacy: { kind: "stop", strength: 1, explicit: true, intimacyContext: true },
      },
    };
  }
  return nlu;
}

function resolvePendingQuestionReply(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !frame.pendingQuestion) return nlu;
  const current = normalizeDialogueForMatching(currentText);
  const pending = normalizeDialogueForMatching(frame.pendingQuestion);
  const stateQuestion = /(?:как\s+ты|как\s+дела|как\s+себя|настроен|самочувств|чувствуешь)/u.test(pending);
  if (!stateQuestion) return nlu;

  if (/^(?:плохо|так\s+себе|такое\s+себе|не\s+очень|хреновато|паршиво)[.! ]*$/u.test(current)) {
    return {
      ...nlu,
      intent: "user_sad",
      topic: "wellbeing",
      sentiment: "negative",
      confidence: Math.max(nlu.confidence, 0.9),
    };
  }
  if (/^(?:нормально|норм|вроде\s+норм|все\s+нормально|всё\s+нормально)[.! ]*$/u.test(current)) {
    return {
      ...nlu,
      intent: "acknowledgement",
      topic: "wellbeing",
      sentiment: "neutral",
      confidence: Math.max(nlu.confidence, 0.86),
    };
  }
  return nlu;
}

function resolveAdjacentCharacterTurn(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!isLikelyAdjacentCharacterTurn(nlu, frame, currentText)) return nlu;
  const normalized = normalizeDialogueForMatching(currentText ?? "");
  const asksBack = nlu.isQuestion || /\?\s*$/u.test((currentText ?? "").trim());
  const alreadySpecific = !["unknown", "statement"].includes(nlu.intent);
  const explicitTopic = nlu.topic && !["conversation", "social", "character"].includes(nlu.topic)
    ? nlu.topic
    : undefined;
  if (alreadySpecific && explicitTopic && !CONTEXTUAL.has(nlu.intent)) return nlu;
  return {
    ...nlu,
    intent: alreadySpecific
      ? nlu.intent
      : asksBack
        ? "ask_followup"
        : "reference_previous_topic",
    topic: frame.lastCharacterTopic ?? frame.previousTopic ?? frame.currentTopic ?? nlu.topic ?? "conversation",
    isQuestion: asksBack || nlu.isQuestion,
    confidence: Math.max(nlu.confidence, frame.pendingQuestion && !asksBack ? 0.9 : 0.84),
    semantic: {
      ...nlu.semantic,
      subject: asksBack && !alreadySpecific ? "character" : nlu.semantic.subject,
      stance: asksBack && !alreadySpecific && nlu.semantic.stance === "neutral" ? "ask_fact" : nlu.semantic.stance,
      focus: asksBack && !alreadySpecific && !nlu.semantic.focus && normalized.length <= 40
        ? frame.previousCharacterText
        : nlu.semantic.focus,
      reciprocal: true,
    },
  };
}

export function resolveContextualNLU(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  const pendingReply = resolvePendingQuestionReply(nlu, frame, currentText);
  const adjacent = resolveAdjacentCharacterTurn(pendingReply, frame, currentText);
  const certainty = resolveCharacterCertaintyFollowup(adjacent, frame, currentText);
  const reciprocal = resolveReciprocalQuestion(certainty, frame, currentText);
  const reciprocalDesire = resolveReciprocalDesireQuestion(reciprocal, frame, currentText);
  const activityDetail = resolveCharacterActivityDetailFollowup(reciprocalDesire, frame, currentText);
  const elliptical = resolveEllipticalCharacterFollowup(activityDetail, frame, currentText);
  const openLoop = resolveCharacterOpenLoopFollowup(elliptical, frame, currentText);
  const replyReference = resolveCharacterReplyReference(openLoop, frame, currentText);
  const intimacy = resolveContextualIntimacy(replyReference, frame, currentText);
  const contextual = resolveDeicticContinuation(intimacy, frame, currentText);
  if (!CONTEXTUAL.has(contextual.intent)) return contextual;
  const resolved = hasResolvableReference(contextual, frame);
  return {
    ...contextual,
    topic: resolveContinuityTopic(contextual, frame),
    confidence: resolved
      ? Math.max(contextual.confidence, 0.72)
      : Math.min(contextual.confidence, 0.38),
  };
}
