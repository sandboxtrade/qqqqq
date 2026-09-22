import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';
import type { Perception, PerceptionIntent, PerceptionTone } from '../cognition/cognition-types';
import { getFirebaseApp, isFirebaseConfigured } from '../storage/firebase';
import { runtimeGeminiModel } from '../config/runtime-config';


const AI_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = AI_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('AI request timed out.')), timeoutMs);
    }),
  ]);
}

const intents: PerceptionIntent[] = [
  'question', 'statement', 'request', 'disclosure', 'affection', 'apology', 'disagreement', 'invitation', 'boundary', 'unknown',
];
const tones: PerceptionTone[] = ['neutral', 'warm', 'cold', 'playful', 'irritated', 'sad', 'anxious', 'vulnerable', 'unknown'];

const schema = Schema.object({
  properties: {
    probableIntent: Schema.enumString({ enum: intents }),
    tone: Schema.enumString({ enum: tones }),
    topics: Schema.array({ items: Schema.string(), maxItems: 8 }),
    emotionalSignals: Schema.array({ items: Schema.string(), maxItems: 8 }),
    agreementPressure: Schema.number(),
    vulnerability: Schema.number(),
    urgency: Schema.number(),
    ambiguity: Schema.number(),
    confidence: Schema.number(),
  },
});

function score(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

export async function analyzeUserMessage(userText: string): Promise<Perception | null> {
  if (!isFirebaseConfigured) return null;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, {
      model: runtimeGeminiModel,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    const prompt = `
Analyze one user message for a persistent fictional companion engine.
Do not answer the message. Do not infer secret facts, diagnoses, or motives.
Classify only what is reasonably supported by the wording.
All numeric fields must be between 0 and 1.
Ambiguity should be high when multiple ordinary interpretations are plausible.
Agreement pressure measures how strongly the user is trying to obtain validation rather than merely asking for an opinion.

USER MESSAGE:
${userText}`.trim();

    const result = await withTimeout(model.generateContent(prompt));
    const raw = JSON.parse(result.response.text()) as Partial<Perception>;
    if (!raw.probableIntent || !intents.includes(raw.probableIntent)) return null;
    if (!raw.tone || !tones.includes(raw.tone)) return null;

    return {
      literalMeaning: userText.trim(),
      probableIntent: raw.probableIntent,
      tone: raw.tone,
      topics: Array.isArray(raw.topics) ? raw.topics.filter((v): v is string => typeof v === 'string').slice(0, 8) : [],
      emotionalSignals: Array.isArray(raw.emotionalSignals)
        ? raw.emotionalSignals.filter((v): v is string => typeof v === 'string').slice(0, 8)
        : [],
      agreementPressure: score(raw.agreementPressure),
      vulnerability: score(raw.vulnerability),
      urgency: score(raw.urgency),
      ambiguity: score(raw.ambiguity),
      confidence: score(raw.confidence),
      source: 'gemini',
    };
  } catch {
    return null;
  }
}
