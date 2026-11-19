import { failureKind, retryDelay } from "./retry";
import { nextStamp, type EditStamp } from "./clock";
import {
  edit,
  reconcile,
  values,
  same,
  type CloudRow,
  type Json,
  type Records,
  type Replica,
} from "./model";
import type { ReplicaStore } from "./store";
export interface Cloud {
  read(since?: number): Promise<{
    initialized: boolean;
    rows: CloudRow[];
    serverTime?: number;
    cursor?: number;
  }>;
  initialize(records: Records, device: string): Promise<CloudRow[]>;
  write(
    key: string,
    value: Json,
    revision: number,
    operation: string,
    device: string,
    stamp?: EditStamp,
  ): Promise<{ applied: boolean; row: CloudRow }>;
}
export class SyncEngine {
  state!: Replica;
  private running?: Promise<void>;
  private closed = false;
  constructor(
    private store: ReplicaStore,
    readonly user: string,
    private cloud: Cloud,
    private changed: () => void,
    private validate: (records: Records) => void = () => {},
  ) {}
  private async update<T>(change: (state: Replica) => T) {
    const result = await this.store.transaction(this.user, change);
    if (!this.closed) {
      this.state = result.state;
      this.changed();
    }
    return result;
  }
  async load() {
    await this.update((state) => {
      // Repair outboxes saved by the old manual-conflict policy on upgrade.
      for (const pending of Object.values(state.pending))
        delete pending.conflict;
    });
  }
  get records() {
    return values(this.state);
  }
  get pending() {
    return Object.keys(this.state.pending).length;
  }
  get conflicts() {
    return Object.entries(this.state.pending).filter(
      ([, p]) => "conflict" in p,
    );
  }
  get diagnostics() {
    const queue = Object.values(this.state.pending);
    return {
      blocked: queue.filter((p) => p.blocked).length,
      retryCount: queue.reduce((n, p) => n + (p.attempts || 0), 0),
      nextRetryAt: queue.length
        ? Math.min(...queue.map((p) => p.retryAt || Date.now()))
        : undefined,
      oldestPendingAt: queue.length
        ? Math.min(...queue.map((p) => p.queuedAt || Date.now()))
        : undefined,
    };
  }
  close() {
    this.closed = true;
  }
  async change(
    changes: { key: string; value: Json; previous: Json; stamp?: EditStamp }[],
  ) {
    if (this.closed) return;
    await this.update((state) => {
      for (const c of changes) edit(state, c.key, c.value, c.previous, c.stamp);
    });
  }
  sync(initial: Records): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run(initial).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async run(initial: Records) {
    if (this.closed) return;
    const snapshot = await this.cloud.read(this.state.cursor);
    if (this.closed) return;
    if (!snapshot.initialized) this.validate(initial);
    const rows = snapshot.initialized
      ? snapshot.rows
      : await this.cloud.initialize(initial, this.state.device);
    if (this.closed) return;
    // Another device may have won initialization after our initial read.
    this.validate({
      ...Object.fromEntries(
        Object.values(this.state.remote).map((row) => [row.key, row.value]),
      ),
      ...Object.fromEntries(rows.map((row) => [row.key, row.value])),
    });
    await this.update((state) => {
      if (snapshot.serverTime) {
        state.timeOffset = snapshot.serverTime - Date.now();
        // A wall-clock jump while offline must not pin future edits forever.
        if (state.clock && state.clock.time > snapshot.serverTime + 60000)
          state.clock = undefined;
        for (const [key, pending] of Object.entries(state.pending))
          if (
            pending.stamp &&
            pending.stamp.time > snapshot.serverTime + 60000
          ) {
            pending.stamp = nextStamp(
              state.device,
              [
                state.remote[key]?.stamp,
                rows.find((row) => row.key === key)?.stamp,
              ],
              snapshot.serverTime,
            );
            pending.id = crypto.randomUUID();
            delete pending.retryAt;
            delete pending.blocked;
          }
      }
      if (snapshot.cursor !== undefined) state.cursor = snapshot.cursor;
      state.initialized = true;
      reconcile(state, rows);
    });
    // Independent records can travel concurrently. Each CAS is acknowledged
    // against its own operation ID, so a later local edit is never erased.
    for (let count = 0; count < 100 && !this.closed; count++) {
      const { result: batch } = await this.update((state) =>
        Object.entries(state.pending)
          .filter(([, p]) => !p.retryAt || p.retryAt <= Date.now())
          .slice(0, 8),
      );
      if (!batch.length) return;
      const results = await Promise.allSettled(
        batch.map(async ([key, pending]) => {
          try {
            const result = await this.cloud.write(
              key,
              pending.value,
              pending.revision,
              pending.id,
              this.state.device,
              pending.stamp,
            );
            if (this.closed) return;
            await this.update((state) => {
              if (result.applied && state.pending[key]?.id === pending.id)
                delete state.pending[key];
              reconcile(state, [result.row]);
            });
          } catch (error) {
            if (this.closed) return;
            const kind = failureKind(error);
            if (kind === "auth") throw error;
            await this.update((state) => {
              const current = state.pending[key];
              if (current?.id !== pending.id) return;
              current.attempts = (current.attempts || 0) + 1;
              current.blocked = kind === "permanent";
              current.retryAt =
                Date.now() +
                (current.blocked
                  ? 86400000
                  : retryDelay(
                      current.attempts,
                      (error as { retryAfterMs?: number }).retryAfterMs,
                    ));
            });
          }
        }),
      );
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    }
  }
}
export function changes(previous: Records, next: Records) {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((key) => !same(previous[key], next[key]))
    .map((key) => ({
      key,
      previous: previous[key] ?? null,
      value: next[key] ?? null,
    }));
}
