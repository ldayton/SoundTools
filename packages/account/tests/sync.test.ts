import { test } from "node:test";
import assert from "node:assert/strict";
import { SyncEngine, changes, type Cloud } from "../sync";
import {
  freshReplica,
  same,
  type Replica,
  type Records,
  type CloudRow,
  type Json,
} from "../model";
import type { ReplicaStore } from "../store";
class Memory implements ReplicaStore {
  states = new Map<string, Replica>();
  async transaction<T>(user: string, change: (state: Replica) => T) {
    const state = structuredClone(this.states.get(user) ?? freshReplica());
    const result = change(state);
    this.states.set(user, structuredClone(state));
    return { state, result: structuredClone(result) };
  }
}
class Backend implements Cloud {
  initialized = false;
  rows: Record<string, CloudRow> = {};
  operations = new Set<string>();
  afterWrite?: () => Promise<void>;
  offline = false;
  async read() {
    if (this.offline) throw Error("offline");
    return {
      initialized: this.initialized,
      rows: structuredClone(Object.values(this.rows)),
    };
  }
  async initialize(records: Records, device: string) {
    if (!this.initialized) {
      this.initialized = true;
      for (const [key, value] of Object.entries(records))
        this.rows[key] = {
          key,
          value,
          device,
          revision: 1,
          operation: crypto.randomUUID(),
        };
    }
    return structuredClone(Object.values(this.rows));
  }
  async write(
    key: string,
    value: Json,
    revision: number,
    operation: string,
    device: string,
  ) {
    if (this.offline) throw Error("offline");
    let row = this.rows[key];
    const applied =
      this.operations.has(operation) || (row?.revision ?? 0) === revision;
    if (applied && !this.operations.has(operation)) {
      row = this.rows[key] = {
        key,
        value: structuredClone(value),
        revision: revision + 1,
        operation,
        device,
      };
      this.operations.add(operation);
    }
    await this.afterWrite?.();
    return { applied, row: structuredClone(row) };
  }
}
test("JSONB key reordering does not create changes or false conflicts", () => {
  assert(
    same(
      { pitch: { low: 48, high: 72 }, stanzas: [1, 2] },
      { stanzas: [1, 2], pitch: { high: 72, low: 48 } },
    ),
  );
  assert(!same([1, 2], [2, 1]));
  assert(!same({ deleted: null }, {}));
  assert.deepEqual(
    changes({ pitch: { low: 48, high: 72 } }, { pitch: { high: 72, low: 48 } }),
    [],
  );
});
async function device(cloud: Backend, store = new Memory(), user = "owner") {
  const engine = new SyncEngine(store, user, cloud, () => {});
  await engine.load();
  return engine;
}
test("first import is atomic; a new device loads cloud data instead of uploading its defaults", async () => {
  const cloud = new Backend();
  const a = await device(cloud);
  await a.sync({ tempo: 80, range: [48, 72] });
  const b = await device(cloud);
  await b.sync({ tempo: 120, range: [60, 84] });
  assert.deepEqual(b.records, { tempo: 80, range: [48, 72] });
});
test("offline edits survive reload, and changes to independent settings merge", async () => {
  const cloud = new Backend();
  const store = new Memory();
  const a = await device(cloud, store);
  await a.sync({ tempo: 80, stanzas: [1] });
  cloud.offline = true;
  await a.change(changes(a.records, { ...a.records, tempo: 100 }));
  await assert.rejects(a.sync({}));
  const reload = await device(cloud, store);
  assert.equal(reload.records.tempo, 100);
  assert.equal(reload.pending, 1);
  cloud.offline = false;
  const b = await device(cloud);
  await b.sync({});
  await b.change(changes(b.records, { ...b.records, stanzas: [1, 2] }));
  await b.sync({});
  await reload.sync({});
  assert.deepEqual(reload.records, { tempo: 100, stanzas: [1, 2] });
  assert.equal(reload.pending, 0);
});
test("a committed write whose response was lost is acknowledged on retry without duplication", async () => {
  const cloud = new Backend();
  const a = await device(cloud);
  await a.sync({ tempo: 80 });
  await a.change(changes(a.records, { tempo: 100 }));
  cloud.afterWrite = async () => {
    throw Error("lost response");
  };
  await assert.rejects(a.sync({}));
  assert.equal(a.pending, 1);
  cloud.afterWrite = undefined;
  await a.sync({});
  assert.equal(a.pending, 0);
  assert.equal(cloud.rows.tempo.revision, 2);
});
test("an edit during upload cannot be erased by the earlier acknowledgement or become a false conflict", async () => {
  const cloud = new Backend();
  const a = await device(cloud);
  await a.sync({ tempo: 80 });
  await a.change(changes(a.records, { tempo: 100 }));
  let release!: () => void, ready!: () => void;
  const started = new Promise<void>((r) => (ready = r));
  cloud.afterWrite = () => {
    ready();
    return new Promise((r) => (release = r));
  };
  const syncing = a.sync({});
  await started;
  await a.change(changes(a.records, { tempo: 110 }));
  cloud.afterWrite = undefined;
  release();
  await syncing;
  assert.equal(a.pending, 0);
  assert.equal(a.conflicts.length, 0);
  assert.equal(cloud.rows.tempo.value, 110);
});
test("concurrent settings automatically rebase with server-ordered last-write-wins, preserving atomic pitch tuples", async () => {
  const cloud = new Backend(),
    a = await device(cloud),
    b = await device(cloud);
  await a.sync({ pitch: { low: 48, high: 72, key: "C" }, volume: 50 });
  await b.sync({});
  await a.change([
    {
      key: "pitch",
      previous: a.records.pitch,
      value: { low: 48, high: 76, key: "C" },
    },
  ]);
  await b.change([
    {
      key: "pitch",
      previous: b.records.pitch,
      value: { low: 60, high: 84, key: "G" },
    },
    { key: "volume", previous: 50, value: 65 },
  ]);
  await b.sync({});
  await a.sync({});
  await b.sync({});
  assert.equal(a.pending, 0);
  assert.equal(b.pending, 0);
  assert.equal(a.conflicts.length, 0);
  assert.deepEqual(a.records, b.records);
  assert.deepEqual(a.records.pitch, { low: 48, high: 76, key: "C" });
  assert.equal(a.records.volume, 65);
});
test("reset checkpoints can move backwards; separate users have separate durable queues", async () => {
  const cloud = new Backend(),
    store = new Memory(),
    a = await device(cloud, store);
  await a.sync({ checkpoint: { position: 30 } });
  await a.change(changes(a.records, { checkpoint: { position: 0 } }));
  await a.sync({});
  assert.deepEqual(cloud.rows.checkpoint.value, { position: 0 });
  const other = await device(cloud, store, "other");
  assert.deepEqual(other.records, {});
});
test("two tabs share one durable queue and do not erase disjoint edits", async () => {
  const cloud = new Backend(),
    store = new Memory(),
    a = await device(cloud, store);
  await a.sync({ tempo: 80, volume: 50 });
  const b = await device(cloud, store);
  await a.change([{ key: "tempo", value: 100, previous: 80 }]);
  await b.change([{ key: "volume", value: 60, previous: 50 }]);
  await a.sync({});
  await b.load();
  assert.deepEqual(b.records, { tempo: 100, volume: 60 });
});
test("closed engines ignore late responses and cannot publish another account into the app", async () => {
  const cloud = new Backend(),
    a = await device(cloud);
  await a.sync({ tempo: 80 });
  await a.change(changes(a.records, { tempo: 100 }));
  let release!: () => void, ready!: () => void;
  const started = new Promise<void>((r) => (ready = r));
  cloud.afterWrite = () => {
    ready();
    return new Promise((r) => (release = r));
  };
  const syncing = a.sync({});
  await started;
  a.close();
  release();
  await syncing;
  assert.equal(a.pending, 1);
});

test("old blocked conflict queues repair themselves on reload without a user choice", async () => {
  const cloud = new Backend(),
    store = new Memory(),
    a = await device(cloud, store),
    b = await device(cloud);
  await a.sync({ tempo: 80 });
  await b.sync({});
  await a.change([{ key: "tempo", previous: 80, value: 120 }]);
  await b.change([{ key: "tempo", previous: 80, value: 100 }]);
  await b.sync({});
  await store.transaction("owner", (state) => {
    state.pending.tempo.conflict = 100;
  });
  const reloaded = await device(cloud, store);
  await reloaded.sync({});
  await b.sync({});
  assert.equal(reloaded.pending, 0);
  assert.equal(reloaded.conflicts.length, 0);
  assert.equal(cloud.rows.tempo.value, 120);
  assert.equal(b.records.tempo, 120);
});
test("independent uploads run concurrently and all completed acknowledgements survive a partial failure", async () => {
  const cloud = new Backend(),
    a = await device(cloud);
  await a.sync({ one: 0, two: 0 });
  await a.change(changes(a.records, { one: 1, two: 2 }));
  const write = cloud.write.bind(cloud);
  let active = 0,
    peak = 0;
  cloud.write = async (...args) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    try {
      if (args[0] === "one") throw Error("temporary");
      return await write(...args);
    } finally {
      active--;
    }
  };
  await assert.rejects(a.sync({}), /temporary/);
  assert.equal(peak, 2);
  assert.equal(a.state.pending.two, undefined);
  assert.ok(a.state.pending.one);
  cloud.write = write;
  await a.sync({});
  assert.equal(a.pending, 0);
});
test("concurrent first initialization validates the winning cloud schema before writing", async () => {
  const { checkSchema, AccountDataError } = await import("../model");
  let writes = 0;
  const cloud: Cloud = {
    read: async () => ({ initialized: false, rows: [] }),
    initialize: async () => [
      {
        key: "schema",
        value: 2,
        revision: 1,
        device: crypto.randomUUID(),
        operation: crypto.randomUUID(),
      },
    ],
    write: async () => {
      writes++;
      throw Error("outdated client attempted a write");
    },
  };
  const engine = new SyncEngine(
    new Memory(),
    "owner",
    cloud,
    () => {},
    checkSchema,
  );
  await engine.load();
  await engine.change([{ key: "tempo", value: 120, previous: 80 }]);
  await assert.rejects(engine.sync({ schema: 1, tempo: 80 }), AccountDataError);
  assert.equal(writes, 0);
});

test("a stale baseline in one browser reconciles automatically without concurrent device use", async () => {
  const cloud = new Backend(),
    previousSession = await device(cloud);
  await previousSession.sync({ tempo: 80 });
  await previousSession.change([{ key: "tempo", previous: 80, value: 100 }]);
  await previousSession.sync({});
  previousSession.close();
  const reopened = await device(cloud);
  await reopened.sync({});
  await reopened.change([{ key: "tempo", previous: 80, value: 120 }]);
  await reopened.sync({});
  assert.equal(reopened.pending, 0);
  assert.equal(reopened.conflicts.length, 0);
  assert.equal(cloud.rows.tempo.value, 120);
});

test("simultaneous compare-and-swap writers automatically converge after a rejected revision", async()=>{
 const cloud=new Backend(),a=await device(cloud),b=await device(cloud);
 await a.sync({tempo:80});await b.sync({});
 await a.change([{key:"tempo",previous:80,value:100}]);await b.change([{key:"tempo",previous:80,value:120}]);
 await Promise.all([a.sync({}),b.sync({})]);await a.sync({});await b.sync({});
 assert.equal(a.pending,0);assert.equal(b.pending,0);assert.deepEqual(a.records,b.records);
 assert.ok([100,120].includes(a.records.tempo as number));
});
