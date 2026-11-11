import {
  legacyGuitarScaleProfile,
  mergeGuitarScaleSettings,
} from "./guitar-scale-settings";
import { defaultProgress, loadProgress, type Progress } from "./progress";
export type DurableState = {
  version: 1;
  progress: Progress;
  activities: Record<string, unknown>;
  legacy: Record<string, unknown>;
};
export type StoredState = {
  revision: number;
  owner: string;
  state: DurableState;
};
export interface PersistenceAdapter {
  read(): Promise<StoredState | null>;
  claim(owner: string, initial: StoredState): Promise<StoredState>;
  write(expected: number, owner: string, state: StoredState): Promise<void>;
}
export function decodeState(raw: unknown): DurableState {
  const s = raw as DurableState;
  if (s?.version !== 1)
    throw Error(
      "Unsupported saved-state version; update this app before continuing.",
    );
  if (
    !s.progress ||
    s.progress.version !== 5 ||
    !s.activities ||
    typeof s.activities !== "object" ||
    Array.isArray(s.activities) ||
    !s.legacy ||
    typeof s.legacy !== "object"
  )
    throw Error("Invalid saved state; existing data has been preserved.");
  for (const [id, activity] of Object.entries(s.activities)) {
    if (!activity || typeof activity !== "object" || !("version" in activity))
      throw Error(
        "Invalid activity checkpoint; saved data has been preserved.",
      );
    if (
      activity.version !== 1 &&
      !(id === "patterns" && activity.version === 2)
    )
      throw Error(
        "Unsupported activity version; update this app before continuing.",
      );
  }
  return migrateGuitarScalePreview(
    {
      ...structuredClone(s),
      progress: loadProgress(JSON.stringify(s.progress)),
    },
    s.progress,
  );
}
export function migrateLegacy(
  raw: Record<string, string | null>,
): DurableState {
  if (raw.progress) {
    let old: any;
    try {
      old = JSON.parse(raw.progress);
    } catch {
      throw Error("Invalid legacy saved data; the original is preserved.");
    }
    if (old && ![1, 2, 3, 4, 5].includes(old.version))
      throw Error(
        "Unsupported legacy version; update this app before continuing.",
      );
  }
  const legacy: Record<string, unknown> = { original: structuredClone(raw) };
  for (const id of ["sight", "patterns", "rhythm"])
    try {
      legacy[id] = JSON.parse(raw[id] || "null");
    } catch {
      legacy[id] = null;
    }
  return migrateGuitarScalePreview(
    {
      version: 1,
      progress: raw.progress ? loadProgress(raw.progress) : defaultProgress(),
      activities: {},
      legacy,
    },
    raw.progress ? JSON.parse(raw.progress) : undefined,
  );
}
function migrateGuitarScalePreview(
  state: DurableState,
  rawProgress: unknown,
): DurableState {
  const profile = legacyGuitarScaleProfile(rawProgress);
  if (!profile) return state;
  state.legacy["guitar-scales-profile"] ??= structuredClone(profile);
  state.activities["guitar-scales"] ??= {
    version: 1,
    settings: mergeGuitarScaleSettings({
      tonic: profile.scaleTonic,
      quality: profile.scaleQuality,
    }),
  };
  if (state.progress.mode === "scales") state.progress.mode = "guitar-scales";
  return state;
}
/** Queue immutable snapshots; the adapter fences every write by ownership and revision. */
export class DurableStore {
  private tail: Promise<void> = Promise.resolve();
  private revision: number;
  readonly state: DurableState;
  private constructor(
    private adapter: PersistenceAdapter,
    private owner: string,
    stored: StoredState,
  ) {
    this.revision = stored.revision;
    this.state = decodeState(stored.state);
  }
  static async open(
    adapter: PersistenceAdapter,
    initial: DurableState,
    owner: string,
  ) {
    const existing = await adapter.read();
    if (existing) decodeState(existing.state);
    return new DurableStore(
      adapter,
      owner,
      await adapter.claim(owner, { revision: 0, owner, state: initial }),
    );
  }
  flush() {
    return this.tail;
  }
  save() {
    const snapshot = structuredClone(this.state);
    const operation = this.tail.then(async () => {
      const next = {
        revision: this.revision + 1,
        owner: this.owner,
        state: snapshot,
      };
      await this.adapter.write(this.revision, this.owner, next);
      this.revision = next.revision;
    });
    // A failed queue stays failed: never overwrite newer or unconfirmed data on retry.
    this.tail = operation;
    return operation;
  }
}
export class IndexedDBAdapter implements PersistenceAdapter {
  constructor(private db: IDBDatabase) {}
  static open(): Promise<IndexedDBAdapter> {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open("soundtools-notecards", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("state");
      r.onerror = () => reject(r.error);
      r.onblocked = () =>
        reject(Error("Close older app windows to update storage."));
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(new IndexedDBAdapter(r.result));
      };
    });
  }
  read(): Promise<StoredState | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("state", "readonly");
      const r = tx.objectStore("state").get("root");
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }
  private transaction<T>(
    run: (store: IDBObjectStore, resolve: (value: T) => void) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("state", "readwrite", {
        durability: "strict",
      });
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = () =>
        reject(tx.error || Error("Storage transaction failed"));
      tx.onabort = () =>
        reject(
          tx.error || Error("Stale writer: another window owns practice."),
        );
      try {
        run(tx.objectStore("state"), (v) => {
          value = v;
        });
      } catch (e) {
        tx.abort();
        reject(e);
      }
    });
  }
  claim(owner: string, initial: StoredState) {
    return this.transaction<StoredState>((store, done) => {
      const r = store.get("root");
      r.onsuccess = () => {
        try {
          const value = r.result || initial;
          decodeState(value.state);
          if (!Number.isSafeInteger(value.revision) || value.revision < 0)
            throw Error("Invalid revision");
          const next = { ...value, owner };
          store.put(next, "root");
          done(next);
        } catch {
          store.transaction.abort();
        }
      };
    });
  }
  write(expected: number, owner: string, state: StoredState) {
    return this.transaction<void>((store, done) => {
      const r = store.get("root");
      r.onsuccess = () => {
        if (r.result?.revision !== expected || r.result?.owner !== owner) {
          store.transaction.abort();
          return;
        }
        store.put(state, "root");
        done();
      };
    });
  }
}
