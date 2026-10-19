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
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "") : "";
  if (/permission-denied/i.test(`${code} ${raw}`))
    return "Firestore отклонил доступ. Проверь правила и вход в Google. [permission-denied]";
  // Preserve the operation name: a generic "Нет связи с Firebase" concealed
  // which Firestore request failed and encouraged unnecessary internet checks.
  const operation = raw.match(/\[Firestore:([A-Za-z][A-Za-z0-9]*)\]/u)?.[1];
  const where = operation ? ` (${operation})` : "";
  if (/unavailable|offline|network-request-failed/i.test(`${code} ${raw}`))
    return `Firestore${where}: сервис не ответил${code ? ` [${code}]` : ""}. Это не обязательно проблема твоего интернета. Повтори сообщение с тем же ID.`;
  if (/aborted|deadline-exceeded|resource-exhausted/i.test(`${code} ${raw}`))
    return `Firestore${where}: запрос не завершился${code ? ` [${code}]` : ""}. Можно безопасно повторить это же сообщение.`;
  return (code ? `[${code}] ${raw}` : raw).slice(0, 900);
}
