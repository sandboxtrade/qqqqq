import type { RuntimeTrace } from "../../engine/runtime";

export function DebugPanel({ trace }: { trace: RuntimeTrace | null }) {
  if (!trace)
    return (
      <div className="debug-empty">Trace появится после первого сообщения.</div>
    );
  return (
    <details className="debug-panel">
      <summary>Engine trace</summary>
      <pre>{JSON.stringify(trace, null, 2)}</pre>
    </details>
  );
}
