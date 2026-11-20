import test from "node:test";
import assert from "node:assert/strict";
import { nextStamp, compareStamp } from "../clock";
import { failureKind, retryAfter, retryDelay } from "../retry";
import {
  freshReplica,
  edit,
  reconcile,
  values,
  type Replica,
  type CloudRow,
} from "../model";
import { SyncEngine, type Cloud } from "../sync";
import { SyncLeader } from "../leader";
class Memory {
  state = freshReplica();
  async transaction<T>(_user: string, fn: (s: Replica) => T) {
    const s = structuredClone(this.state),
      result = fn(s);
    this.state = structuredClone(s);
    return { state: s, result };
  }
}
const row = (
  key: string,
  value: number,
  revision: number,
  time: number,
  node = "remote",
): CloudRow => ({
  key,
  value,
  revision,
  device: node,
  operation: crypto.randomUUID(),
  stamp: { time, counter: 0, node },
});
test("hybrid clock observes causal edits, survives backwards wall clocks, and resolves ties deterministically", () => {
  const a = nextStamp("a", [], 100),
    b = nextStamp("b", [a], 10);
  assert.ok(compareStamp(b, a) > 0);
  assert.ok(compareStamp({ ...a, node: "b" }, a) > 0);
  let prior = a;
  for (let i = 0; i < 1000; i++) {
    const next = nextStamp("a", [prior], (Math.random() * 200) | 0);
    assert.ok(compareStamp(next, prior) > 0);
    prior = next;
  }
});
test("an older offline edit cannot overwrite a newer edit after reconnecting; deletions retain ordering", () => {
  const s = freshReplica();
  reconcile(s, [row("pitch", 1, 1, 100)]);
  edit(s, "pitch", 2, 1);
  s.pending.pitch.stamp = { time: 150, counter: 0, node: s.device };
  reconcile(s, [row("pitch", 3, 2, 200)]);
  assert.equal(s.pending.pitch, undefined);
  assert.equal(values(s).pitch, 3);
  edit(s, "pitch", null, 3);
  s.pending.pitch.stamp = { time: 250, counter: 0, node: s.device };
  reconcile(s, [row("pitch", 4, 3, 225)]);
  assert.equal(values(s).pitch, null);
});
test("retry classification, retry-after and capped jitter respect rate limits", () => {
  assert.equal(failureKind({ status: 429 }), "transient");
  assert.equal(failureKind({ status: 401 }), "auth");
  assert.equal(failureKind({ code: "22023" }), "permanent");
  assert.equal(retryAfter("12", 1000), 12000);
  assert.equal(retryAfter(new Date(9000).toUTCString(), 1000), 8000);
  assert.equal(
    retryDelay(1, 0, () => 0),
    500,
  );
  assert.equal(
    retryDelay(50, 0, () => 1),
    60000,
  );
  assert.equal(retryDelay(1, 120000), 120000);
});
test("poison records cannot block healthy records and retry state survives reload", async () => {
  const store = new Memory(),
    calls: string[] = [];
  const cloud: Cloud = {
    read: async () => ({ initialized: true, rows: [] }),
    initialize: async () => [],
    write: async (key, value, revision, operation, device, stamp) => {
      calls.push(key);
      if (key.startsWith("bad")) throw { status: 422 };
      return {
        applied: true,
        row: { key, value, revision: revision + 1, operation, device, stamp },
      };
    },
  };
  const reported: { error: unknown; details: Record<string, unknown> }[] = [];
  const engine = new SyncEngine(
    store,
    "u",
    cloud,
    () => {},
    undefined,
    (error, details) => reported.push({ error, details }),
  );
  await engine.load();
  await engine.change(
    Array.from({ length: 12 }, (_, i) => ({
      key: `bad${i}`,
      value: 1,
      previous: null,
    })).concat([{ key: "healthy", value: 2, previous: null }]),
  );
  await engine.sync({});
  assert.equal(engine.records.healthy, 2);
  assert.equal(engine.state.pending.healthy, undefined);
  assert.equal(engine.diagnostics.blocked, 12);
  assert.equal(reported.length, 12);
  assert.deepEqual(reported[0].error, { status: 422 });
  assert.equal(reported[0].details.failureKind, "permanent");
  assert(
    !JSON.stringify(reported).includes("bad0"),
    "settings record keys are not diagnostic context",
  );
  const again = new SyncEngine(store, "u", cloud, () => {});
  await again.load();
  const count = calls.length;
  await again.sync({});
  assert.equal(calls.length, count);
  await again.change([{ key: "bad0", value: 3, previous: 1 }]);
  assert.equal(again.state.pending.bad0.retryAt, undefined);
});
test("incremental pulls validate the combined replica and recover future clock jumps", async () => {
  const store = new Memory();
  let read = 0;
  const engine = new SyncEngine(
    store,
    "u",
    {
      read: async (since) => {
        read++;
        return since === undefined
          ? {
              initialized: true,
              rows: [row("schema", 1, 1, 100)],
              cursor: 1,
              serverTime: 1000,
            }
          : {
              initialized: true,
              rows: [row("tempo", 90, 1, 200)],
              cursor: 2,
              serverTime: 1000,
            };
      },
      initialize: async () => [],
      write: async () => {
        throw { status: 503 };
      },
    },
    () => {},
    (records) => assert.equal(records.schema, 1),
  );
  await engine.load();
  await engine.sync({});
  await engine.change([{ key: "volume", value: 2, previous: null }]);
  await store.transaction("u", (s) => {
    s.pending.volume.stamp = { time: 1000000000, counter: 0, node: s.device };
  });
  await engine.load();
  await engine.sync({});
  assert.equal(engine.state.cursor, 2);
  assert.equal(engine.records.tempo, 90);
  assert.equal(engine.state.pending.volume.stamp?.time, 1000);
  assert.equal(read, 2);
});
test("randomly reordered snapshots never regress confirmed revisions", () => {
  for (let run = 0; run < 100; run++) {
    const s = freshReplica();
    const rows = Array.from({ length: 25 }, (_, i) =>
      row("value", i + 1, i + 1, (i + 1) * 10),
    ).sort(() => Math.random() - 0.5);
    for (const r of rows) reconcile(s, [r]);
    assert.equal(s.remote.value.revision, 25);
    assert.equal(s.remote.value.value, 25);
  }
});
test("a visible-tab leader releases the connection and another tab can take over", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let held = false;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          fn: (lock: object | null) => Promise<void>,
        ) => {
          if (held) return fn(null);
          held = true;
          try {
            await fn({});
          } finally {
            held = false;
          }
        },
      },
    },
  });
  try {
    const a = new SyncLeader("same", () => {}),
      b = new SyncLeader("same", () => {});
    assert.equal(await a.claim(), true);
    assert.equal(await b.claim(), false);
    a.close();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(await b.claim(), true);
    b.close();
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete (globalThis as any).navigator;
  }
});
