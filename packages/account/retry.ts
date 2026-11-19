export type FailureKind = "auth" | "permanent" | "transient" | "storage";
export function failureKind(error: unknown): FailureKind {
  const e = error as { status?: number; code?: string; name?: string };
  if (
    ["QuotaExceededError", "InvalidStateError", "NotFoundError"].includes(
      e?.name || "",
    )
  )
    return "storage";
  const status = Number(e?.status || e?.code);
  const code = String(e?.code || "");
  if (
    [401, 403].includes(status) ||
    ["42501", "PGRST301", "PGRST303"].includes(code)
  )
    return "auth";
  if (
    [400, 404, 413, 422].includes(status) ||
    /^(22|23)[0-9A-Z]{3}$/.test(code)
  )
    return "permanent";
  return "transient";
}
export function retryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  return Math.max(
    0,
    Number.isFinite(seconds)
      ? seconds * 1000
      : (Date.parse(value) || now) - now,
  );
}
export function retryDelay(
  attempt: number,
  minimum = 0,
  random = Math.random,
): number {
  return Math.max(
    minimum,
    Math.round(
      (0.5 + random() * 0.5) *
        Math.min(60000, 1000 * 2 ** Math.min(attempt - 1, 10)),
    ),
  );
}
