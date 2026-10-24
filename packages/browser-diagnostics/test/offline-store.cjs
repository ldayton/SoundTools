const { test } = require("node:test"),
  assert = require("node:assert/strict");
const envelope = (value) => [
  { sent_at: new Date().toISOString() },
  [[{ type: "event" }, { timestamp: Date.now() / 1000, message: value }]],
];
test("blocked offline storage has a deadline, bounded memory FIFO and closes late connections", async () => {
  const { createOfflineStore } = await import("../src/offline-store.mjs");
  let request,
    closed = false;
  const env = {
    setTimeout,
    clearTimeout,
    indexedDB: {
      open() {
        return (request = {});
      },
    },
  };
  const store = createOfflineStore(
    { dbName: "test", maxQueueSize: 2, timeoutMs: 10 },
    env,
  );
  await Promise.all([
    store.push(envelope("one")),
    store.push(envelope("two")),
    store.push(envelope("three")),
  ]);
  assert.equal((await store.shift())[1][0][1].message, "one");
  assert.equal((await store.shift())[1][0][1].message, "two");
  assert.equal(await store.shift(), undefined);
  request.result = {
    close() {
      closed = true;
    },
  };
  request.onsuccess();
  assert(closed);
  store.close();
});
test("unavailable storage supports retry priority and disposal without late writes", async () => {
  const { createOfflineStore } = await import("../src/offline-store.mjs");
  const store = createOfflineStore(
    { dbName: "test", maxQueueSize: 2 },
    { setTimeout, clearTimeout },
  );
  await store.push(envelope("second"));
  await store.unshift(envelope("first"));
  assert.equal((await store.shift())[1][0][1].message, "first");
  store.close();
  await store.push(envelope("late"));
  assert.equal(await store.shift(), undefined);
});
test("stalled offline transactions abort and fall back to memory", async () => {
  const { createOfflineStore } = await import("../src/offline-store.mjs");
  let aborted = false,
    closed = false;
  const db = {
    close() {
      closed = true;
    },
    transaction() {
      return {
        objectStore() {
          return {
            getAllKeys() {
              return {};
            },
          };
        },
        abort() {
          aborted = true;
        },
      };
    },
  };
  const env = {
    setTimeout,
    clearTimeout,
    indexedDB: {
      open() {
        const request = {};
        queueMicrotask(() => {
          request.result = db;
          request.onsuccess();
        });
        return request;
      },
    },
  };
  const store = createOfflineStore({ dbName: "test", timeoutMs: 10 }, env);
  await store.push(envelope("saved-in-memory"));
  assert(aborted);
  assert(closed);
  assert.equal((await store.shift())[1][0][1].message, "saved-in-memory");
  store.close();
});
