import { APP } from "./app-profile";
import { shellStatus } from "./shell-status";
import {
  DurableStore,
  IndexedDBAdapter,
  migrateLegacy,
  decodeState,
  type DurableState,
} from "./durable-state";
import { STORAGE_KEY } from "./progress";
const keys = {
  progress: STORAGE_KEY,
  sight: `soundtools:${APP.id}:sight-reading:v1`,
  patterns: `soundtools:${APP.id}:patterns:v1`,
  rhythm: `soundtools:${APP.id}:rhythm:v1`,
};
export const persistence = {
  state: migrateLegacy({}) as DurableState,
  writable: false,
  store: undefined as DurableStore | undefined,
  pending: 0,
  fail(message: string) {
    this.writable = false;
    shellStatus.set({
      blocked: true,
      error: message,
      saved: "Changes are not saved. " + message,
    });
  },
  async initialize() {
    const raw: Record<string, string | null> = {};
    try {
      for (const [id, key] of Object.entries(keys))
        raw[id] = localStorage.getItem(key);
    } catch {
      /* IndexedDB may still be available. */
    }
    try {
      const initial = migrateLegacy(raw);
      const adapter = await IndexedDBAdapter.open();
      if (!navigator.locks)
        throw Error(
          "This browser cannot safely coordinate practice windows. Use a current browser.",
        );
      await new Promise<void>((resolve, reject) => {
        void navigator.locks
          .request(
            `soundtools-${APP.id}-writer`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                const stored = await adapter.read();
                if (stored) {
                  this.state = decodeState(stored.state);
                }
                this.fail(
                  "Practice is open in another window. Close that window, then reload this one to continue.",
                );
                resolve();
                return;
              }
              try {
                this.store = await DurableStore.open(
                  adapter,
                  initial,
                  crypto.randomUUID(),
                );
                this.state = this.store.state;
                this.writable = true;
                resolve();
                // Browser releases the lock on termination, including crash/reload. Never steal a live lock.
                await new Promise<void>((release) =>
                  window.addEventListener(
                    "pagehide",
                    () => {
                      this.writable = false;
                      release();
                    },
                    { once: true },
                  ),
                );
              } catch (e) {
                reject(e);
              }
            },
          )
          .catch(reject);
      });
      if (this.writable) {
        // Retain legacy keys unchanged for rollback. New-schema data is authoritative after migration.
        // Old deployed tabs cannot participate in ownership; detect their writes and stop this writer.
        window.addEventListener("storage", (e) => {
          if (Object.values(keys).includes(e.key || ""))
            this.fail(
              "An older app window changed its saved data. Close older windows and reload; the current checkpoint is preserved.",
            );
        });
        shellStatus.set({ saved: "Saved on this device." });
      }
    } catch (e) {
      this.fail(
        "Practice storage is unavailable: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  },
  save() {
    if (!this.writable || !this.store) return Promise.resolve(false);
    this.pending++;
    shellStatus.set({ saved: "Saving on this device…" });
    return this.store.save().then(
      () => {
        if (--this.pending === 0 && this.writable)
          shellStatus.set({ saved: "Saved on this device." });
        return true;
      },
      (e) => {
        this.pending--;
        this.fail(
          "Could not save this change. Reload to recover the last saved checkpoint. " +
            (e instanceof Error ? e.message : String(e)),
        );
        return false;
      },
    );
  },
  async prepareUpdate() {
    if (!this.store) return true;
    if (!this.writable) return false;
    this.writable = false;
    shellStatus.set({ blocked: true });
    try {
      await this.store.flush();
      return true;
    } catch (e) {
      this.fail(
        "Update paused because practice could not be saved. Reload to recover the last saved checkpoint.",
      );
      return false;
    }
  },
  read<T>(id: string): T | undefined {
    return this.state.activities[id] as T | undefined;
  },
  write(id: string, value: unknown) {
    if (!this.writable) return;
    this.state.activities[id] = structuredClone(value);
    void this.save();
  },
};
