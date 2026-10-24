const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { create } = require("../core.js");
function environment() {
  const env = new EventTarget(),
    document = new EventTarget();
  document.visibilityState = "visible";
  const storage = new Map();
  Object.assign(env, {
    document,
    navigator: {
      onLine: true,
      userAgent: "Mozilla/5.0 (iPhone) Version/18 Safari/605",
    },
    performance: { now: () => 0 },
    crypto: { randomUUID: () => String(Math.random()) },
    localStorage: {
      getItem: (k) => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
    },
    setInterval: () => 1,
    clearInterval() {},
    innerWidth: 390,
    innerHeight: 844,
  });
  return { env, storage };
}
test("bounded histories, numeric summaries and allowlisted data exclude voice/user content", async () => {
  const { env } = environment(),
    d = create(
      {
        app: "soundglow",
        release: "abc",
        snapshot: () => ({
          view: "pitch",
          title: "PRIVATE",
          pcm: new Float32Array([1, 2]),
          sampleRate: 48000,
        }),
      },
      env,
    );
  await d.ready;
  for (let i = 0; i < 400; i++) {
    d.event("transport.play", { view: "pitch", name: "PRIVATE" });
    d.metric("analysis.ms", i);
  }
  d.capture(
    Object.assign(new Error("PRIVATE user@example.com token=SECRET"), {
      stack:
        "Error: PRIVATE\n at app (https://example.org/assets/main.js?token=SECRET:12:9)",
    }),
    "audio.failed",
  );
  const r = await d.report(),
    json = JSON.stringify(r);
  assert(!/PRIVATE|SECRET|user@example/.test(json));
  assert.equal(r.events.length, 100);
  assert.equal(r.context.sampleRate, 48000);
  assert.equal(r.metrics["analysis.ms"].count, 400);
  assert.equal(r.metrics["analysis.ms"].mean, 199.5);
  assert.equal(
    r.errors[0].frames[0].filename,
    "https://example.org/assets/main.js",
  );
  await d.dispose();
});
test("every configured session reports automatically and ignores legacy preferences", async () => {
  const { env, storage } = environment();
  storage.set("soundglow:diagnostics:sharing", "no");
  let factories = 0,
    calls = 0;
  const options = {
    app: "soundglow",
    release: "a",
    dsn: "public",
    random: () => 1,
    remoteFactory: async () => {
      factories++;
      return {
        capture() {
          calls++;
        },
      };
    },
  };
  const d = create(options, env);
  await d.ready;
  d.capture(Error(), "audio.one");
  assert.equal(calls, 1);
  assert.equal(d.getState().automatic, true);
  const other = create({ ...options, app: "dorego" }, env);
  await other.ready;
  assert.equal(other.getState().automatic, true);
  assert.equal(factories, 2);
  await d.dispose();
  await other.dispose();
});
test("failed storage and reporter do not break capture; clear removes retained context", async () => {
  const { env } = environment();
  env.localStorage = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  env.indexedDB = {
    open() {
      throw Error();
    },
  };
  const d = create(
    {
      app: "dorego",
      release: "a",
      dsn: "x",
      remoteFactory: async () => {
        throw Error("offline");
      },
    },
    env,
  );
  await d.ready;
  assert.equal(d.getState().status, "unavailable");
  d.capture(Error("failed"), "sample.failed");
  assert.equal((await d.report()).errors.length, 1);
  await d.clear();
  assert.equal((await d.report()).errors.length, 0);
  await d.dispose();
});
test("disposal during reporter loading closes the late client without sending", async () => {
  const { env } = environment();
  let resolve,
    closed = false,
    sends = 0;
  const wait = new Promise((r) => (resolve = r)),
    d = create(
      {
        app: "soundglow",
        release: "a",
        dsn: "x",
        remoteFactory: async () => {
          await wait;
          return {
            capture() {
              sends++;
            },
            close() {
              closed = true;
            },
          };
        },
      },
      env,
    );
  await d.dispose();
  resolve();
  await d.ready;
  assert(closed);
  assert.equal(sends, 0);
});
test("duplicate exceptions and repeated failures have bounded storage", async () => {
  const { env } = environment();
  const d = create({ app: "soundglow", release: "a" }, env);
  await d.ready;
  const e = Error("same");
  d.capture(e, "audio.error");
  d.capture(e, "audio.error");
  assert.equal(d.snapshot().errors.length, 1);
  await d.clear();
  d.capture(e, "audio.error");
  assert.equal(d.snapshot().errors.length, 1);
  for (let i = 0; i < 100; i++) d.capture(Error(), `case.${i}`);
  assert.equal(d.snapshot().errors.length, 30);
  await d.dispose();
});

test("frame timing excludes warmup, idle and hidden gaps; long-task observer is cleaned up", async () => {
  const { env } = environment();
  let time = 0,
    callback,
    disconnected = false;
  env.performance.now = () => time;
  env.PerformanceObserver = class {
    static supportedEntryTypes = ["longtask"];
    constructor(fn) {
      callback = fn;
    }
    observe() {}
    disconnect() {
      disconnected = true;
    }
  };
  const d = create({ app: "soundglow", release: "test" }, env);
  await d.ready;
  d.frame(0, true);
  time = 2100;
  d.frame(time, true);
  time += 16;
  d.frame(time, true);
  assert.equal(d.snapshot().metrics["render.interval_ms"].count, 1);
  env.document.visibilityState = "hidden";
  time = 30000;
  d.frame(time, true);
  callback({ getEntries: () => [{ duration: 1000 }] });
  assert(!d.snapshot().metrics["main.long_task_ms"]);
  env.document.visibilityState = "visible";
  time = 30000;
  d.frame(time, true);
  time = 32001;
  d.frame(time, true);
  time += 17;
  d.frame(time, true);
  assert.equal(d.snapshot().metrics["render.interval_ms"].max, 17);
  callback({ getEntries: () => [{ duration: 100 }] });
  assert.equal(d.snapshot().metrics["main.long_task_ms"].max, 100);
  await d.dispose();
  assert(disconnected);
});

test("metric names cannot collide with object prototypes", async () => {
  const { env } = environment(),
    d = create({ app: "soundglow", release: "test" }, env);
  await d.ready;
  d.metric("constructor", 7);
  assert.equal(d.snapshot().metrics.constructor.max, 7);
  await d.clear();
  d.metric("constructor", 8);
  assert.equal(d.snapshot().metrics.constructor.max, 8);
  await d.dispose();
});

test("development can disable collection even with a DSN", async () => {
  const { env } = environment();
  let calls = 0;
  const d = create(
    {
      app: "soundglow",
      release: "test",
      dsn: "x",
      enabled: false,
      remoteFactory: () => {
        calls++;
      },
    },
    env,
  );
  await d.ready;
  assert.equal(d.getState().automatic, false);
  assert.equal(calls, 0);
  await d.dispose();
});
test("telemetry batches contain deltas once, count all sessions, and keep hot paths local", async () => {
  const { env } = environment();
  let time = 0;
  env.performance.now = () => time;
  const batches = [];
  const d = create(
    {
      app: "soundglow",
      release: "test",
      dsn: "x",
      random: () => 1,
      remoteFactory: async () => ({
        summary(batch) {
          batches.push(batch);
        },
      }),
    },
    env,
  );
  await d.ready;
  assert.equal(batches[0].counts["session.started"], 1);
  batches.length = 0;
  for (let i = 0; i < 1000; i++) d.metric("analysis.ms", i);
  d.event("transport.play", { running: true, secret: "PRIVATE" });
  assert.equal(batches.length, 0, "No SDK calls in hot paths");
  time = 15000;
  d.flush();
  assert.deepEqual(batches[0].metrics["analysis.ms"], {
    count: 1000,
    sum: 499500,
    max: 999,
  });
  assert.equal(batches[0].counts["transport.play"], 1);
  assert(!JSON.stringify(batches).includes("PRIVATE"));
  time = 30000;
  d.flush();
  assert.equal(Object.keys(batches[1].metrics).length, 0);
  assert.equal(Object.keys(batches[1].counts).length, 0);
  assert.equal(batches[1].elapsedMs, 15000);
  for (let i = 0; i < 1000; i++) d.event("control.click");
  d.flush();
  assert.equal(batches[2].counts["control.click"], 1000);
  assert(batches[2].logs.length <= 50);
  await d.dispose();
});
test("remote startup does not wait for blocked local IndexedDB", async () => {
  const { env } = environment();
  env.indexedDB = { open: () => ({}) };
  let started = false;
  const d = create(
    {
      app: "soundglow",
      release: "test",
      dsn: "x",
      storageTimeoutMs: 20,
      remoteFactory: async () => {
        started = true;
        return {};
      },
    },
    env,
  );
  await Promise.resolve();
  assert(started);
  await d.ready;
  await d.dispose();
});
test("stalled IDB open falls back to memory and closes a late connection", async () => {
  const { env } = environment();
  let request,
    closed = false;
  env.indexedDB = {
    open() {
      return (request = {});
    },
  };
  const d = create(
    { app: "soundglow", release: "test", storageTimeoutMs: 10 },
    env,
  );
  d.capture(Error(), "audio.stalled_storage");
  await d.ready;
  const r = await d.report();
  assert.equal(r.errors[0].code, "audio.stalled_storage");
  await d.clear();
  assert.equal((await d.report()).errors.length, 0);
  request.result = {
    close() {
      closed = true;
    },
  };
  request.onsuccess();
  assert(closed);
  await d.dispose();
});
test("stalled IDB reads and writes abort and keep export/clear usable", async () => {
  for (const operation of ["read", "write", "clear"]) {
    const { env } = environment();
    let aborted = 0,
      closed = 0,
      transactions = 0;
    const db = {
      objectStoreNames: { contains: () => true },
      close() {
        closed++;
      },
      transaction(_store, mode) {
        transactions++;
        const tx = {
          abort() {
            aborted++;
          },
          objectStore() {
            return {
              getAll() {
                const r = {};
                if (operation !== "read" && mode !== "readwrite")
                  queueMicrotask(() => {
                    r.result = [];
                    r.onsuccess?.();
                    tx.oncomplete?.();
                  });
                return r;
              },
              clear() {},
              put() {},
            };
          },
        };
        return tx;
      },
    };
    env.indexedDB = {
      open() {
        const r = {};
        queueMicrotask(() => {
          r.result = db;
          r.onsuccess();
        });
        return r;
      },
    };
    const d = create(
      { app: "soundglow", release: "test", storageTimeoutMs: 10 },
      env,
    );
    await d.ready;
    if (operation === "write") {
      d.event("transport.play");
      await d.persist();
    } else if (operation === "clear") await d.clear();
    const r = await d.report();
    assert(r);
    assert(aborted > 0);
    assert(closed > 0);
    assert(transactions > 0);
    await d.dispose();
  }
});
test("error floods have bounded rate-limit state and recover after the window", async () => {
  const fs = require("node:fs"),
    vm = require("node:vm");
  let tracked;
  class TrackedMap extends Map {
    constructor(...args) {
      super(...args);
      tracked = this;
    }
  }
  const scope = {
    module: { exports: {} },
    Map: TrackedMap,
    URL,
    Date,
    Math,
    Float64Array,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../core.js"), "utf8"),
    scope,
  );
  const { env } = environment();
  let time = 0,
    calls = 0;
  env.performance.now = () => time;
  const d = scope.module.exports.create(
    {
      app: "soundglow",
      release: "test",
      dsn: "x",
      remoteFactory: async () => ({
        capture() {
          calls++;
        },
      }),
    },
    env,
  );
  await d.ready;
  for (let i = 0; i < 500; i++)
    d.capture(
      Object.assign(Error(), {
        stack: `Error\n at x (https://example.org/app.js:${i + 1}:1)`,
      }),
      "runtime.error",
    );
  assert.equal(calls, 20);
  assert.equal(d.snapshot().errors.length, 30);
  assert(tracked.size <= 30);
  assert.equal(d.snapshot().metrics["remote.errors_suppressed"].count, 480);
  await d.clear();
  d.capture(Error(), "audio.still_limited");
  assert.equal(calls, 20);
  time = 60001;
  d.capture(Error(), "audio.recovered");
  assert.equal(calls, 21);
  assert.equal(tracked.size, 1);
  await d.dispose();
});
test("visibility transitions reset timing even when hidden frames never run", async () => {
  const { env } = environment();
  let time = 2100;
  env.performance.now = () => time;
  const d = create({ app: "soundglow", release: "test" }, env);
  await d.ready;
  time = 4200;
  d.frame(time, true);
  time += 16;
  d.frame(time, true);
  env.document.visibilityState = "hidden";
  env.document.dispatchEvent(new Event("visibilitychange"));
  time = 30000;
  env.document.visibilityState = "visible";
  env.document.dispatchEvent(new Event("visibilitychange"));
  d.frame(time, true);
  time += 2100;
  d.frame(time, true);
  time += 16;
  d.frame(time, true);
  assert.equal(d.snapshot().metrics["render.interval_ms"].max, 16);
  await d.dispose();
});

test("a blocked reporter retries with bounded backoff without losing startup counters", async () => {
  const { env } = environment();
  let time = 0,
    tick,
    attempts = 0;
  const batches = [];
  env.performance.now = () => time;
  env.setInterval = (fn) => {
    tick = fn;
    return 1;
  };
  const d = create(
    {
      app: "soundglow",
      release: "test",
      dsn: "x",
      remoteFactory: async () => {
        if (++attempts === 1) throw Error("offline");
        return { summary: (batch) => batches.push(batch) };
      },
    },
    env,
  );
  await d.ready;
  assert.equal(d.getState().status, "unavailable");
  time = 15000;
  tick();
  await Promise.resolve();
  assert.equal(attempts, 1);
  time = 30000;
  tick();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(attempts, 2);
  assert.equal(d.getState().status, "connected");
  assert.equal(batches[0].counts["session.started"], 1);
  await d.dispose();
});

test("local clearing cannot grow pending remote metric cardinality", async () => {
  const { env } = environment(),
    batches = [];
  const d = create(
    {
      app: "dorego",
      release: "test",
      dsn: "x",
      remoteFactory: async () => ({ summary: (batch) => batches.push(batch) }),
    },
    env,
  );
  await d.ready;
  for (let i = 0; i < 100; i++) {
    d.metric("metric." + i, i);
    await d.clear();
  }
  d.flush();
  assert.equal(Object.keys(batches.at(-1).metrics).length, 40);
  await d.dispose();
});
