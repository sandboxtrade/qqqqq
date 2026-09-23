import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
let repository,
  modelCalls = 0,
  lastRequest;
let generate = async (request, options) => {
  modelCalls++;
  lastRequest = request;
  options.onChunk?.("Привет");
  return "Привет! Рада тебя видеть.";
};
globalThis.__getRepo = () => repository;
globalThis.__generate = (...args) => generate(...args);
globalThis.__uid = "A";
const db = new Map();
const snap = (ref) => ({
  exists: () => db.has(ref),
  data: () => structuredClone(db.get(ref)),
  id: ref.split("/").at(-1),
});
const sdk = {
  collection: (_db, ...parts) => parts.join("/"),
  doc: (_db, ...parts) => parts.join("/"),
  documentId: () => "__name__",
  getDoc: async (ref) => snap(ref),
  getDocs: async () => ({ docs: [] }),
  query: (r) => r,
  limit: (x) => x,
  orderBy: (x) => x,
  startAfter: (...x) => x,
  where: (x) => x,
  setDoc: async (ref, value) => {
    db.set(ref, structuredClone(value));
  },
  runTransaction: async (_db, fn) => {
    const writes = [];
    const result = await fn({
      get: async (ref) => snap(ref),
      set: (ref, value) => writes.push(["set", ref, value]),
      delete: (ref) => writes.push(["delete", ref]),
    });
    for (const [op, r, v] of writes) {
      if (op === "delete") db.delete(r);
      else db.set(r, structuredClone(v));
    }
    return result;
  },
};
globalThis.__sdk = sdk;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "firebase/firestore")
      return { url: "mock:firestore", shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const candidate = new URL(specifier, context.parentURL);
      if (
        !candidate.pathname.match(/\.[a-z]+$/) &&
        existsSync(fileURLToPath(candidate) + ".ts")
      )
        return { url: candidate.href + ".ts", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    let source;
    if (url === "mock:firestore")
      source = `export const {collection,doc,documentId,getDoc,getDocs,query,limit,orderBy,startAfter,where,setDoc,runTransaction}=globalThis.__sdk;`;
    else if (url.endsWith("/storage/repository-factory.ts"))
      source =
        "export const getCompanionRepository=(...a)=>globalThis.__getRepo(...a);";
    else if (url.endsWith("/storage/auth.ts"))
      source = "export const getAuthenticatedUid=()=>globalThis.__uid;";
    else if (url.endsWith("/storage/firebase.ts"))
      source = "export const getFirebaseDb=()=>({});";
    else if (url.endsWith("/ai/gemini-client.ts"))
      source =
        'export const generateCharacterReply=(...a)=>globalThis.__generate(...a); export const generateInitiativeMessage=async()=>"Как твои дела?";';
    else if (url.endsWith(".ts"))
      source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), {
        mode: "transform",
      });
    else return next(url, context);
    return { source, format: "module", shortCircuit: true };
  },
});
const { InMemoryCompanionRepository } = await import(
  "../src/storage/repositories/in-memory-repository.ts"
);
const { FirestoreCompanionRepository } = await import(
  "../src/storage/repositories/firestore-repository.ts"
);
const { createEvent } = await import("../src/events/event-types.ts");
const { extractSemanticCandidates } = await import(
  "../src/memory/semantic-extraction.ts"
);
const { consolidateEvents, recoverMemory } = await import(
  "../src/memory/memory-consolidation.ts"
);
const { rankFacts, rankMemories } = await import("../src/memory/memory-retrieval.ts");
const { retrieveMemoryContext } = await import("../src/memory/memory-context.ts");
const { refreshInitiatives } = await import("../src/initiative/initiative-engine.ts");
const { createInitialWorldState, simulateWorld, markUserInteraction } = await import(
  "../src/world/world-engine.ts"
);
const {
  resolveRoutine,
  resolveTimeOfDay,
  StableWorldClock,
  calendarDateKey,
} = await import("../src/world/time-engine.ts");
const { initialEmotionalState, deriveMood, decayEmotions } = await import(
  "../src/emotions/emotion-engine.ts"
);
const { initialRelationshipState } = await import(
  "../src/relationship/relationship-engine.ts"
);
const { sanitizeForFirestore } = await import(
  "../src/storage/firestore-data.ts"
);
const {
  STORAGE_SCHEMA_VERSION,
  MEMORY_PROCESSOR_VERSION,
  decodeCompanionSnapshot,
  decodeWorldState,
  decodeCharacterEvent,
  decodeMemoryRecord,
  decodeMemoryProcessedMarker,
  encodeMemoryRecord,
  encodeIntimacyState,
  decodeIntimacyState,
  encodeIntimacyPreferences,
  decodeIntimacyPreferences,
} = await import("../src/storage/persistence-schema.ts");
const { bootstrapRuntime, handleUserMessage, reconcileRuntimeState } = await import(
  "../src/engine/runtime.ts"
);
const { bounded } = await import("../src/core/async.ts");
const { defaultCharacter } = await import("../src/character/default-character.ts");
const {
  createInitialIntimacyState,
  createInitialIntimacyPreferences,
  evaluateIntimacyHardGate,
  isNeutralIntimacySceneId,
} = await import("../src/intimacy/intimacy-state.ts");
const { defaultIntimacyCoreProfile } = await import(
  "../src/intimacy/intimacy-core.ts"
);
const {
  localPerception,
  mergePerceptions,
  interpret,
  decide,
  planResponse,
} = await import("../src/cognition/local-cognition.ts");
const { guardCharacterReply } = await import("../src/dialogue/response-guard.ts");
const { deriveAvatarCue, resolveAvatarVisualState } = await import(
  "../src/avatar/visual-state.ts"
);
const { mergeChatMessages, replyForFailedMessage } = await import(
  "../src/app/message-sync.ts"
);
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  
console.log("PASS", name);
}
const now = Date.now();
const ev = (id, text, t = now, source = "user") =>
  createEvent({
    id,
    type: "message",
    source,
    timestamp: t,
    payload: { text },
    importance: 0.35,
  });
const replyEv = (id, text, inReplyTo, t = now) =>
  createEvent({
    id,
    type: "message",
    source: "character",
    timestamp: t,
    payload: { text, inReplyTo },
    importance: 0.35,
  });
const emptyMemoryContext = { memories: [], facts: [], openThreads: [] };
function cognitionFor(text, emotion = initialEmotionalState, relationship = initialRelationshipState) {
  const perception = localPerception(text);
  const interpretation = interpret(
    perception,
    emptyMemoryContext,
    emotion,
    relationship,
  );
  const decision = decide(
    defaultCharacter,
    perception,
    interpretation,
    emotion,
    relationship,
    createInitialWorldState(now),
  );
  const plan = planResponse(
    defaultCharacter,
    perception,
    interpretation,
    decision,
    emotion,
  );
  return { perception, interpretation, decision, plan };
}

const {pathToFileURL}=await import('node:url');
const oldRuntime=process.env.VC_BASELINE_RUNTIME ? await import(pathToFileURL(process.env.VC_BASELINE_RUNTIME).href) : null;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const timed=new Set(['getEvent','loadRuntimeState','appendEvent','listMemories','listKnowledgeFacts','listOpenThreads','commitTurn']);
async function measure(handler,label) {
 const base=new InMemoryCompanionRepository();
 await consolidateEvents([ev('evidence','Я люблю кофе.',Date.now()-5000)],base);
 let start,modelAt,firstAt;const reads=[];
 repository=new Proxy(base,{get(target,key){const method=Reflect.get(target,key);if(typeof method!=='function')return method;return async(...args)=>{
   if(timed.has(key))await delay(80);
   if(['listMemories','listKnowledgeFacts','listOpenThreads'].includes(key))reads.push([key,args[0]]);
   return method.apply(target,args);
 };}});
 const t=Date.now();
 const zones=Array.from({length:25},(_,i)=>i-12).map(n=>n===0?'Etc/GMT':`Etc/GMT${n>0?'+':''}${n}`);
 const world=zones.map(z=>createInitialWorldState(t,z)).find(w=>w.isAwake&&w.availability==='free');
 generate=async(req,options)=>{modelAt=performance.now();assert.ok(req.memoryContext.facts.some(f=>f.value==='like'));await delay(120);options.onChunk?.('У меня всё спокойно.');return 'У меня всё спокойно.';};
 start=performance.now();
 await handler({id:'bench-'+label,text:'Помнишь, что я говорил про кофе?',timestamp:t},
   {revision:0,emotion:{...initialEmotionalState,updatedAt:t},relationship:{...initialRelationshipState,updatedAt:t},world},
   {uid:'A',signal:new AbortController().signal,history:[],onChunk:()=>{firstAt??=performance.now();}});
 return {label,beforeModelMs:Math.round(modelAt-start),firstTextMs:Math.round(firstAt-start),totalMs:Math.round(performance.now()-start),reads};
}
const baseline=oldRuntime ? await measure(oldRuntime.handleUserMessage,'baseline') : null;
const improved=await measure(handleUserMessage,'v0.8.0');
if (baseline) assert.deepEqual(improved.reads,baseline.reads);
console.log(JSON.stringify({conditions:'80ms per repository operation, 120ms mocked model, same fact and retrieval budgets',baseline,improved},null,2));
