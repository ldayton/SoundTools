import test from "node:test";
import assert from "node:assert/strict";
import { ActivityHost, type InputEnvironment } from "../src/activity-host";
import type { PracticeActivity, InputPolicy } from "../src/live-practice";
import { readRoute } from "../src/navigation";

const route = (path: string) =>
  readRoute(new URL(path, "https://example.test"), "staff");
const environment: InputEnvironment = {
  writable: true,
  blocked: false,
  visible: true,
  focused: true,
};
function activity(
  log: string[],
  name: string,
  policy: InputPolicy = "answer",
): PracticeActivity {
  return {
    inputPolicy: policy,
    enter: () => {
      log.push(`${name}:enter`);
    },
    leave: () => {
      log.push(`${name}:leave`);
    },
    interrupt: (reason) => {
      log.push(`${name}:${reason}`);
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}

test("flashcards and live activities share enter, leave, interruption and input eligibility", async () => {
  const log: string[] = [];
  const cards = activity(log, "cards");
  const live = activity(log, "live", "restart");
  const host = new ActivityHost({
    load: (mode) => (mode === "staff" ? cards : live),
    changed() {},
    missing() {
      assert.fail("unexpected missing route");
    },
    failed(error) {
      throw error;
    },
  });
  assert.equal(host.inputPolicy(environment), "none");
  await host.activate(route("/guitar/staff"));
  assert.equal(host.active, cards);
  assert.equal(host.inputPolicy(environment), "answer");
  for (const reason of [
    "focus",
    "visibility",
    "connection",
    "controls",
    "resize",
  ] as const)
    host.interrupt(reason);
  for (const patch of [
    { writable: false },
    { blocked: true },
    { visible: false },
    { focused: false },
  ])
    assert.equal(host.inputPolicy({ ...environment, ...patch }), "none");
  await host.activate(route("/piano/patterns"));
  assert.equal(host.active, live);
  assert.equal(host.inputPolicy(environment), "restart");
  await host.activate(route("/settings"));
  assert.equal(host.active, undefined);
  assert.equal(host.inputPolicy(environment), "none");
  assert.deepEqual(log, [
    "cards:enter",
    "cards:focus",
    "cards:visibility",
    "cards:connection",
    "cards:controls",
    "cards:resize",
    "cards:leave",
    "live:enter",
    "live:leave",
  ]);
});

test("a slow module cannot enter after settings; returning reuses it without another load", async () => {
  const log: string[] = [];
  const loading = deferred<PracticeActivity>();
  let loads = 0;
  const host = new ActivityHost({
    load() {
      loads++;
      return loading.promise;
    },
    changed() {},
    missing() {},
    failed(error) {
      throw error;
    },
  });
  const first = host.activate(route("/piano/patterns"));
  const second = host.activate(route("/piano/patterns"));
  await host.activate(route("/settings"));
  loading.resolve(activity(log, "slow"));
  await Promise.all([first, second]);
  assert.deepEqual(log, []);
  assert.equal(loads, 1);
  await host.activate(route("/piano/patterns"));
  assert.deepEqual(log, ["slow:enter"]);
});

test("failed loads can be retried and invalid routes never become interactive", async () => {
  const log: string[] = [];
  const errors: boolean[] = [];
  let missing = 0,
    loads = 0;
  const host = new ActivityHost({
    load() {
      if (++loads === 1) return Promise.reject(new Error("offline chunk"));
      return { ...activity(log, "retry"), applyRoute: () => false };
    },
    changed() {},
    missing() {
      missing++;
    },
    failed(_error, _mode, current) {
      errors.push(current);
    },
  });
  await host.activate(route("/piano/patterns"));
  assert.deepEqual(errors, [true]);
  assert.equal(host.inputPolicy(environment), "none");
  await host.activate(route("/piano/patterns"));
  assert.equal(loads, 2);
  assert.equal(missing, 1);
  assert.deepEqual(log, []);
  assert.equal(host.active, undefined);
});
