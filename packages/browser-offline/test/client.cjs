const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { createUpdatePolicy } = require("../index.cjs");
function fixture(storage = new Map()) {
  const document = new EventTarget();
  document.hidden = false;
  let count = 0;
  const env = {
    document,
    sessionStorage: {
      getItem: (k) => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
    },
  };
  const policy = createUpdatePolicy({
    env,
    app: "test",
    current: "old",
    apply: () => count++,
  });
  return { document, policy, storage, env, count: () => count };
}
test("untouched visible pages apply verified updates once; hidden pages wait until foreground", () => {
  const f = fixture();
  f.document.hidden = true;
  assert.equal(f.policy.offer("new"), false);
  f.document.hidden = false;
  f.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.count(), 1);
  f.policy.offer("newer");
  assert.equal(f.count(), 1);
  f.policy.dispose();
});
test("interaction and unavailable session storage preserve explicit update controls", () => {
  for (const event of ["pointerdown", "keydown", "input", "change", "wheel"]) {
    const f = fixture();
    f.document.dispatchEvent(new Event(event));
    assert.equal(f.policy.offer("new"), false);
    assert.equal(f.count(), 0);
  }
  const f = fixture();
  f.env.sessionStorage.setItem = () => {
    throw Error("storage blocked");
  };
  assert.equal(f.policy.offer("new"), false);
});
test("a stale document cannot enter an automatic update loop", () => {
  const first = fixture();
  assert.equal(first.policy.offer("new"), true);
  const repeated = fixture(first.storage);
  assert.equal(repeated.policy.offer("new"), false);
  assert.equal(repeated.policy.offer("newer"), false);
  const next = createUpdatePolicy({
    env: repeated.env,
    app: "test",
    current: "new",
    apply: () => {
      throw Error("rollback loop");
    },
  });
  assert.equal(next.offer("old"), false);
  repeated.storage.set(
    "test.automaticUpdate",
    JSON.stringify({ at: Date.now() - 61000 }),
  );
  assert.equal(repeated.policy.offer("newer"), true);
});

test("worker RPC sessions close stale requests across page suspension and worker replacement", async () => {
  const { createWorkerSession, createResources } = require("../index.cjs");
  const ports = [];
  const env = {
    MessageChannel,
    navigator: {
      serviceWorker: {
        controller: {
          postMessage(_data, transfer) {
            ports.push(transfer[0]);
          },
        },
      },
    },
  };
  const session = createWorkerSession({ env, resources: createResources() });
  const pending = session.call("download", {}, 1000);
  await new Promise((resolve) => setTimeout(resolve, 0));
  session.abort();
  await assert.rejects(pending, { name: "TimeoutError" });
  assert.equal(session.generation(), 1);
  session.reset();
  const current = session.call("status", {}, 1000);
  await new Promise((resolve) => setTimeout(resolve, 0));
  ports.at(-1).postMessage({ ready: true });
  assert.deepEqual(await current, { ready: true });
  for (const port of ports) port.close();
});

test("interaction during initial script loading prevents automatic refresh", () => {
  const f = fixture();
  f.env.__soundtoolsStartup = { interacted: true };
  assert.equal(f.policy.offer("new"), false);
  assert.equal(f.count(), 0);
});

test("an update targets the offered release while preserving unrelated URL state", () => {
  const { applyUpdate } = require("../index.cjs");
  let target;
  applyUpdate("new", {
    location: {
      href: "https://example.test/app/?feature=yes#pitch",
      replace: (url) => (target = url),
    },
  });
  const url = new URL(target);
  assert.equal(url.searchParams.get("__soundtools_update"), "new");
  assert.equal(url.searchParams.get("feature"), "yes");
  assert.equal(url.hash, "#pitch");
});

test("update navigation waits for the intended worker to finish activation", async () => {
  const { createWorkerSession, createResources } = require("../index.cjs");
  const session = createWorkerSession({ resources: createResources() }),
    worker = new EventTarget();
  worker.state = "activating";
  let done = false;
  const pending = session
    .settle({ active: worker }, 1000)
    .then(() => (done = true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(done, false);
  worker.state = "activated";
  worker.dispatchEvent(new Event("statechange"));
  await pending;
  assert.equal(done, true);
});
