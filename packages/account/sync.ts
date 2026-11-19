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
  read(): Promise<{ initialized: boolean; rows: CloudRow[] }>;
  initialize(records: Records, device: string): Promise<CloudRow[]>;
  write(
    key: string,
    value: Json,
    revision: number,
    operation: string,
    device: string,
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
  close() {
    this.closed = true;
  }
  async change(changes: { key: string; value: Json; previous: Json }[]) {
    if (this.closed) return;
    await this.update((state) => {
      for (const c of changes) edit(state, c.key, c.value, c.previous);
    });
  }
  async resolve(key: string, choice: "device" | "cloud") {
    await this.update((state) => {
      const pending = state.pending[key];
      if (!pending || !("conflict" in pending)) return;
      if (choice === "cloud") delete state.pending[key];
      else {
        delete pending.conflict;
        pending.id = crypto.randomUUID();
      }
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
    const snapshot = await this.cloud.read();
    if (this.closed) return;
    if (!snapshot.initialized) this.validate(initial);
    const rows = snapshot.initialized
      ? snapshot.rows
      : await this.cloud.initialize(initial, this.state.device);
    if (this.closed) return;
    // Another device may have won initialization after our initial read.
    this.validate(Object.fromEntries(rows.map((row) => [row.key, row.value])));
    await this.update((state) => {
      state.initialized = true;
      reconcile(state, rows);
    });
    // Independent records can travel concurrently. Each CAS is acknowledged
    // against its own operation ID, so a later local edit is never erased.
    for (let count = 0; count < 100 && !this.closed; count++) {
      const { result: batch } = await this.update((state) =>
        Object.entries(state.pending).slice(0, 8),
      );
      if (!batch.length) return;
      const results = await Promise.allSettled(
        batch.map(async ([key, pending]) => {
          const result = await this.cloud.write(
            key,
            pending.value,
            pending.revision,
            pending.id,
            this.state.device,
          );
          if (this.closed) return;
          await this.update((state) => {
            if (result.applied && state.pending[key]?.id === pending.id)
              delete state.pending[key];
            reconcile(state, [result.row]);
          });
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
