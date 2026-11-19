import { nextStamp, compareStamp, type EditStamp } from "./clock";
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type Records = Record<string, Json>;
export class AccountDataError extends Error {}
export function checkSchema(records: Records) {
  if (records.schema !== undefined && records.schema !== 1)
    throw new AccountDataError(
      "Update this app before opening its cloud data. Your saved data is preserved.",
    );
}
export type CloudRow = {
  key: string;
  value: Json;
  revision: number;
  device: string;
  operation: string;
  stamp?: EditStamp;
};
export type Pending = {
  id: string;
  base: Json;
  value: Json;
  revision: number;
  conflict?: Json;
  stamp?: EditStamp;
  queuedAt?: number;
  attempts?: number;
  retryAt?: number;
  blocked?: boolean;
};
export type Replica = {
  version: 1;
  device: string;
  initialized: boolean;
  cursor?: number;
  clock?: EditStamp;
  timeOffset?: number;
  remote: Record<string, CloudRow>;
  pending: Record<string, Pending>;
};
/** Postgres JSONB reorders object keys. Equality must not depend on insertion order. */
export function same(a: Json | undefined, b: Json | undefined): boolean {
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => same(v, b[i]))
    );
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
  );
}
export function values(replica: Replica): Records {
  return Object.fromEntries([
    ...Object.entries(replica.remote).map(([key, row]) => [key, row.value]),
    ...Object.entries(replica.pending).map(([key, pending]) => [
      key,
      pending.value,
    ]),
  ]);
}
/** Adapters split independent settings into separate records. Checkpoints and
 * related pitch choices remain indivisible. Concurrent pending intent is
 * automatically rebased; server revisions determine the final write order. */
export function merge(
  base: Json,
  local: Json,
  remote: Json,
): { value: Json; conflict: boolean } {
  if (same(local, remote) || same(base, remote))
    return { value: local, conflict: false };
  if (same(base, local)) return { value: remote, conflict: false };
  return { value: local, conflict: false };
}
export function freshReplica(): Replica {
  return {
    version: 1,
    device: crypto.randomUUID(),
    initialized: false,
    remote: {},
    pending: {},
  };
}
export function reconcile(replica: Replica, rows: CloudRow[]) {
  for (const row of rows) {
    const previous = replica.remote[row.key];
    if (previous && previous.revision > row.revision) continue;
    replica.remote[row.key] = row;
    if (
      row.stamp &&
      (!replica.clock || compareStamp(row.stamp, replica.clock) > 0)
    )
      replica.clock = row.stamp;
    const pending = replica.pending[row.key];
    if (!pending) continue;
    if (pending.id === row.operation || same(pending.value, row.value)) {
      delete replica.pending[row.key];
      continue;
    }
    if (
      pending.stamp &&
      row.stamp &&
      compareStamp(row.stamp, pending.stamp) >= 0
    ) {
      delete replica.pending[row.key];
      continue;
    }
    if (pending.revision === row.revision) continue;
    // Rebase pending intent onto the server revision, then CAS it back. The
    // server orders concurrent writes; unrelated records merge independently.
    const result =
      row.device === replica.device
        ? { value: pending.value, conflict: false }
        : merge(pending.base, pending.value, row.value);
    pending.base = row.value;
    pending.revision = row.revision;
    pending.id = crypto.randomUUID();
    if (result.conflict) pending.conflict = row.value;
    else {
      pending.value = result.value;
      delete pending.conflict;
    }
  }
}
export function edit(
  replica: Replica,
  key: string,
  value: Json,
  previous: Json,
  intentStamp?: EditStamp,
) {
  const stamp =
    intentStamp ??
    nextStamp(
      replica.device,
      [replica.clock, replica.remote[key]?.stamp],
      Date.now() + (replica.timeOffset || 0),
    );
  if (!replica.clock || compareStamp(stamp, replica.clock) > 0)
    replica.clock = stamp;
  const pending = replica.pending[key];
  const remote = replica.remote[key];
  if (pending) {
    pending.value = structuredClone(value);
    pending.stamp = stamp;
    pending.queuedAt = Date.now();
    delete pending.retryAt;
    delete pending.attempts;
    delete pending.blocked;
    pending.id = crypto.randomUUID();
    if (same(value, remote?.value)) delete replica.pending[key];
    return;
  }
  const result = merge(previous, value, remote?.value ?? null);
  if (same(result.value, remote?.value) && !result.conflict) return;
  replica.pending[key] = {
    id: crypto.randomUUID(),
    base: remote?.value ?? null,
    value: structuredClone(result.value),
    revision: remote?.revision ?? 0,
    stamp,
    queuedAt: Date.now(),
    ...(result.conflict ? { conflict: remote?.value ?? null } : {}),
  };
}
