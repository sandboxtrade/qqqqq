/** Volatile, non-sensitive Firebase diagnostics for mobile UI. Never persist IDs,
 * Firestore document data, conversation text, credentials or token contents. */
export interface FirebaseDiagnostic {
  operation: string;
  code: string;
  elapsedMs: number;
  at: number;
}
let lastFailure: FirebaseDiagnostic | null = null;
const listeners = new Set<() => void>();

export function recordFirebaseFailure(operation: string, code: string, elapsedMs: number): void {
  lastFailure = {
    operation: operation.slice(0, 60),
    code: code.slice(0, 80) || "unknown",
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
    at: Date.now(),
  };
  for (const listener of listeners) listener();
}

export function lastFirebaseFailure(): FirebaseDiagnostic | null {
  return lastFailure;
}

export function subscribeFirebaseDiagnostic(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
