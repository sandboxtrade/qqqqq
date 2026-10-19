/**
 * Read operations can be timed out safely: no Firestore data is changed if the
 * caller moves on. Writes and mixed read/repair methods MUST be awaited until
 * the Firestore SDK settles them. Racing a write against a short timeout
 * leaves a live transaction that can commit after the caller has retried.
 */
export const FIRESTORE_READ_TIMEOUT_MS = 30_000;

const PURE_READ_METHODS = new Set([
  "getEvent", "loadRuntimeState", "loadSnapshot", "loadWorldState", "listRecentEvents", "listConversationEvents", "listPendingTurns",
  "listPendingMemoryEvents", "listProcessedMemoryEvents",
  "loadEditableContext", "loadIntimacyState", "loadIntimacyPreferences",
  "loadMemoryRecoveryState", "loadMemory", "listMemories", "loadKnowledge",
  "listKnowledge", "getKnowledge", "listOpenThreads", "loadOpenThreads",
  "loadInitiative", "listInitiatives", "loadFacts", "listFacts",
]);

export function mayTimeOutFirestoreOperation(method: string): boolean {
  // Fail closed. Unrecognised methods may write and should not be detached.
  return PURE_READ_METHODS.has(method);
}

export function annotateFirestoreOperation(error: unknown, method: string): Error {
  const original = error instanceof Error ? error : new Error(String(error));
  const wrapped = new Error(`[Firestore:${method}] ${original.message}`);
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "") : "";
  if (code) (wrapped as Error & { code?: string }).code = code;
  return wrapped;
}
