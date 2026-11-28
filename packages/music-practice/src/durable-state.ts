import {same,type Json} from "@ldayton/account/model";
import {migrateHymnIdentity} from "./hymn-identity";
import { APP } from "./app-profile";
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
  commit(
    owner: string,
    base: DurableState,
    snapshot: DurableState,
  ): Promise<void>;
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
  const decoded=structuredClone(s);
  // Retired checkpoints must not block recovery of the remaining activities.
  if(APP.id === "notewise") {
    delete decoded.activities.rhythm;
    delete decoded.legacy.rhythm;
    const original=decoded.legacy.original;
    if(original && typeof original === "object")delete (original as Record<string,unknown>).rhythm;
  }
  for (const [id, activity] of Object.entries(decoded.activities)) {
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
  if(APP.id === "songalong") {
    if(decoded.activities.sight)decoded.activities.sight=migrateHymnIdentity(decoded.activities.sight);
    if(decoded.legacy.sight)decoded.legacy.sight=migrateHymnIdentity(decoded.legacy.sight);
  }
  return migrateGuitarScalePreview(
    {
      ...decoded,
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
  const original=structuredClone(raw);
  delete original.rhythm;
  const legacy: Record<string, unknown> = { original };
  for (const id of ["sight", "patterns"])
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
/** Apply only this window's edits to the latest checkpoint. Arrays and activity
 * checkpoints are atomic; merging session internals could create an invalid session.
 */
function edited(base: unknown, local: unknown, latest: unknown): any {
  if (JSON.stringify(base) === JSON.stringify(local))
    return structuredClone(latest);
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (object(base) && object(local) && object(latest)) {
    const result = structuredClone(latest);
    for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
      if (!(key in local)) {
        if (key in base) delete result[key];
      } else result[key] = edited(base[key], local[key], latest[key]);
    }
    return result;
  }
  return structuredClone(local);
}
export function mergeWindowState(
  base: DurableState,
  local: DurableState,
  latest: DurableState,
): DurableState {
  const next = edited(base, local, latest) as DurableState;
  next.activities = structuredClone(latest.activities);
  for (const key of new Set([
    ...Object.keys(base.activities),
    ...Object.keys(local.activities),
  ])) {
    if (
      JSON.stringify(base.activities[key]) ===
      JSON.stringify(local.activities[key])
    )
      continue;
    if (key in local.activities)
      next.activities[key] = structuredClone(local.activities[key]);
    else delete next.activities[key];
  }
  // Settings have independent fields. Musical checkpoints above remain whole.
  for (const key of [
    "audio",
    "presentation",
    "guitar-scales",
    "backing-track",
    "metronome",
    ...Object.keys(local.activities).filter((k) =>
      k.startsWith("backing-mixer"),
    ),
  ]) {
    if (key in local.activities)
      next.activities[key] = edited(
        base.activities[key] || {},
        local.activities[key],
        latest.activities[key] || {},
      );
  }
  // Song preferences and bookmarks are independent per song/arrangement. Preserve
  // a bookmark as a whole rather than splicing two sessions into one checkpoint.
  if (local.activities.sight && next.activities.sight) {
    const before = (base.activities.sight || {}) as Record<string, any>;
    const current = local.activities.sight as Record<string, any>;
    const remote = (latest.activities.sight || {}) as Record<string, any>;
    const result = next.activities.sight as Record<string, any>;
    for (const field of ["bookmarks", "sections", "preferences", "favorites"]) {
      const merged = structuredClone(remote[field] || {});
      for (const key of new Set([
        ...Object.keys(before[field] || {}),
        ...Object.keys(current[field] || {}),
      ])) {
        if (
          JSON.stringify(before[field]?.[key]) ===
          JSON.stringify(current[field]?.[key])
        )
          continue;
        if (key in (current[field] || {})) {
          merged[key] = field === "preferences"
            ? edited(before[field]?.[key] || {},current[field][key],remote[field]?.[key] || {})
            : structuredClone(current[field][key]);
          if(field === "preferences"){
            const pitch=["key","octave","capo"];
            if(pitch.some(k=>JSON.stringify(before[field]?.[key]?.[k])!==JSON.stringify(current[field][key]?.[k])))
              for(const k of pitch){if(k in current[field][key])merged[key][k]=structuredClone(current[field][key][k]);else delete merged[key][k];}
          }
        } else delete merged[key];
      }
      if (current[field] || remote[field]) result[field] = merged;
    }
    for (const field of ["low", "high", "mode"]) {
      if (field in current || field in remote)
        result[field] = edited(before[field], current[field], remote[field]);
    }
    const active=result.preferences?.[result.hymn];
    if(active)for(const [key,value] of Object.entries(active))
      if(!["low","high","mode","zoom"].includes(key))result[key]=structuredClone(value);
    if (current.zoomByLayout)
      result.zoomByLayout = edited(
        before.zoomByLayout || {},
        current.zoomByLayout,
        remote.zoomByLayout || {},
      );
  }
  // Two windows answering the same card must both contribute their new attempts.
  for (const [key, stat] of Object.entries(local.progress.stats)) {
    const before = base.progress.stats[key];
    const remote = latest.progress.stats[key];
    const attempts = stat.attempts - (before?.attempts || 0);
    if (attempts > 0 && remote) {
      next.progress.stats[key] = {
        ...(remote.lastSeen > stat.lastSeen ? remote : stat),
        attempts: remote.attempts + attempts,
        correct: remote.correct + stat.correct - (before?.correct || 0),
      };
    }
  }
  return next;
}
/** Each window queues immutable edits; IndexedDB merges and commits them atomically. */
export class DurableStore {
  private tail: Promise<void> = Promise.resolve();
  private base: DurableState;
  readonly state: DurableState;
  private constructor(
    private adapter: PersistenceAdapter,
    private owner: string,
    stored: StoredState,
  ) {
    this.state = decodeState(stored.state);
    this.base = structuredClone(this.state);
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
  async refresh() {
    await this.flush();
    const before=structuredClone(this.state),base=structuredClone(this.base),stored=await this.adapter.read();
    if(!stored || !same(before as unknown as Json,this.state as unknown as Json))return false;
    const latest=decodeState(stored.state),next=mergeWindowState(base,before,latest);
    const changed=!same(this.state as unknown as Json,next as unknown as Json);
    Object.assign(this.state,next);this.base=structuredClone(next);return changed;
  }
  save() {
    const snapshot = structuredClone(this.state);
    const base = this.base;
    this.base = snapshot;
    const operation = this.tail.then(() =>
      this.adapter.commit(this.owner, base, snapshot),
    );
    // Failed queues stay failed: never silently continue after an unconfirmed save.
    this.tail = operation;
    return operation;
  }
}
export class IndexedDBAdapter implements PersistenceAdapter {
  constructor(private db: IDBDatabase) {}
  static open(): Promise<IndexedDBAdapter> {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(`soundtools-${APP.id}`, 1);
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
        reject(tx.error || Error("Practice storage transaction was aborted."));
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
  commit(owner: string, base: DurableState, snapshot: DurableState) {
    return this.transaction<void>((store, done) => {
      const r = store.get("root");
      r.onsuccess = () => {
        try {
          const current = r.result as StoredState;
          const latest = decodeState(current?.state);
          if (!Number.isSafeInteger(current.revision) || current.revision < 0)
            throw Error("Invalid revision");
          const state = mergeWindowState(base, snapshot, latest);
          decodeState(state);
          store.put({ revision: current.revision + 1, owner, state }, "root");
          done();
        } catch {
          store.transaction.abort();
        }
      };
    });
  }
}
