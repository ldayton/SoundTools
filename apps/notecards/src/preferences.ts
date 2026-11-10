import { diagnostics } from "./diagnostics";
/** Storage handles availability and serialization; each activity owns validation and defaults. */
export function loadPreferences<T>(
  key: string,
  defaults: T,
  merge: (base: T, input: unknown) => T,
): T {
  try {
    return merge(defaults, JSON.parse(localStorage.getItem(key) || "null"));
  } catch {
    return defaults;
  }
}
export function savePreferences(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    diagnostics.offline("storage", "failed", { cacheReason: "storage" });
  }
}
