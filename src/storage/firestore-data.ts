// Only plain data is traversed. Firestore Timestamp/FieldValue/Date keep their prototypes.
export function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value))
    return value
      .filter((item) => item !== undefined)
      .map(sanitizeForFirestore) as T;
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeForFirestore(item)]),
    ) as T;
  }
  return value;
}
