export function checkSignal(signal?: AbortSignal) {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException("Операция отменена.", "AbortError");
}

export function bounded<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (failed: boolean, error: unknown, value?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      if (failed) reject(error);
      else resolve(value as T);
    };
    const aborted = () =>
      finish(
        true, signal?.reason ?? new DOMException("Операция отменена.", "AbortError"),
      );
    const timer = setTimeout(
      () => finish(true, new Error(`${label}: превышено время ожидания.`)),
      ms,
    );
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
    promise.then(
      (value) => finish(false, null, value),
      (error) => finish(true, error),
    );
  });
}

export function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/permission-denied/i.test(raw))
    return "Firestore отклонил доступ. Проверь правила и вход в Google. [permission-denied]";
  if (/unavailable|offline|network-request-failed/i.test(raw))
    return "Нет связи с Firebase. Проверь интернет и повтори отправку.";
  return raw.slice(0, 900);
}
