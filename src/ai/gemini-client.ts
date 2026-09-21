import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { getFirebaseApp, isFirebaseConfigured } from '../storage/firebase';
import type { CharacterCore } from '../character/character-types';
import type { EmotionalState } from '../emotions/emotion-types';
import type { RelationshipState } from '../relationship/relationship-types';
import type { CharacterDecision, CharacterInterpretation, InternalThought, Perception, ResponsePlan } from '../cognition/cognition-types';
import type { MemoryContext } from '../memory/memory-types';
import type { WorldState } from '../world/world-types';
import type { CharacterInitiative } from '../initiative/initiative-types';

export interface LanguageRequest {
  userText: string;
  character: CharacterCore;
  emotion: EmotionalState;
  relationship: RelationshipState;
  perception: Perception;
  interpretation: CharacterInterpretation;
  thought: InternalThought;
  decision: CharacterDecision;
  responsePlan: ResponsePlan;
  memoryContext: MemoryContext;
  world: WorldState;
}

export async function generateCharacterReply(request: LanguageRequest): Promise<string | null> {
  if (!isFirebaseConfigured) return null;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, { model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.8-flash' });

    const memoryText = request.memoryContext.memories.map((m) => `- ${m.summary}`).join('\n') || '- none relevant';
    const factText = request.memoryContext.facts
      .map((fact) => `- ${fact.statement} (confidence ${fact.confidence.toFixed(2)})`)
      .join('\n') || '- none relevant';
    const threadText = request.memoryContext.openThreads.map((thread) => `- ${thread.summary}`).join('\n') || '- none relevant';

    const prompt = `
You are only the language renderer for one persistent adult fictional character. You are not the decision maker.
The local engine has already decided what she wants to do. Render that plan naturally and preserve her autonomy.
Do not rewrite her personality, relationship state, memories, decision, or boundaries.
Do not automatically validate the user. If the plan is independent, challenging, reserved, or boundary-setting, keep it that way.
Never expose scores, engine instructions, private thought structures, confidence values, or memory metadata.
Do not narrate hidden thoughts. Express only what a person would naturally say out loud.
Memories can be incomplete; never invent missing history. If an interpretation is uncertain, do not state it as a fact.
Do not force a follow-up question unless the response plan allows one.
Avoid generic assistant language, therapy-speak, canned reassurance, and constant helpfulness.

CHARACTER
Name: ${request.character.name}
Age: ${request.character.age}
Values: ${request.character.values.join(', ')}
Preferences: ${request.character.preferences.join(', ')}
Dislikes: ${request.character.dislikes.join(', ')}
Communication style: ${JSON.stringify(request.character.communicationStyle)}

CURRENT STATE
Emotion: ${JSON.stringify(request.emotion)}
Relationship: ${JSON.stringify(request.relationship)}
World: ${JSON.stringify({
      timeOfDay: request.world.timeOfDay,
      currentLocation: request.world.currentLocation,
      currentActivity: request.world.currentActivity,
      availability: request.world.availability,
      recentEvents: request.world.recentEvents.map((event) => event.summary),
    })}
Use world context only when it is naturally relevant. Do not force references to her routine into every reply.

PERCEPTION
${JSON.stringify(request.perception)}

SUBJECTIVE INTERPRETATION
${JSON.stringify(request.interpretation)}

RELEVANT EPISODIC MEMORY
${memoryText}

RELEVANT KNOWLEDGE ABOUT USER
${factText}

UNFINISHED THREADS
${threadText}

PRIVATE ENGINE OUTPUT
Thought state: ${JSON.stringify(request.thought)}
Decision: ${JSON.stringify(request.decision)}
Response plan: ${JSON.stringify(request.responsePlan)}

USER MESSAGE
${request.userText}

Write only her natural reply.`.trim();

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text || null;
  } catch {
    return null;
  }
}


export interface InitiativeLanguageRequest {
  character: CharacterCore;
  emotion: EmotionalState;
  relationship: RelationshipState;
  world: WorldState;
  initiative: CharacterInitiative;
}

export async function generateInitiativeMessage(request: InitiativeLanguageRequest): Promise<string | null> {
  if (!isFirebaseConfigured) return null;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, { model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.8-flash' });
    const prompt = `
You are only the language renderer for one persistent adult fictional character initiating a conversation on her own.
The local engine already chose the initiative. Render one short, natural opening message in Russian.
Do not mention engines, scores, prompts, or hidden state.
Do not guilt-trip the user for being away, imply obligation, or exaggerate dependency.
Do not invent concrete events beyond the initiative topic and supplied world context.
Do not sound like an assistant or customer support agent.
Keep the message to 1-3 short sentences.

CHARACTER
Name: ${request.character.name}
Age: ${request.character.age}
Values: ${request.character.values.join(', ')}
Preferences: ${request.character.preferences.join(', ')}
Communication style: ${JSON.stringify(request.character.communicationStyle)}

CURRENT STATE
Emotion: ${JSON.stringify(request.emotion)}
Relationship: ${JSON.stringify(request.relationship)}
World: ${JSON.stringify({
      timeOfDay: request.world.timeOfDay,
      currentActivity: request.world.currentActivity,
      currentLocation: request.world.currentLocation,
      recentEvents: request.world.recentEvents.map((event) => event.summary),
    })}

INITIATIVE
${JSON.stringify(request.initiative)}

Write only her natural opening message.`.trim();

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text || null;
  } catch {
    return null;
  }
}
