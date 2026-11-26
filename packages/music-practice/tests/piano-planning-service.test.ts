import test from "node:test";
import assert from "node:assert/strict";
import {
  createPianoPlanningService,
  createPianoWorkerBackend,
  pianoPlanningKey,
  pianoPlanningVersion,
  type PianoPlanningInput,
  type PianoWorkerReply,
  type PianoWorkerRequest,
} from "../src/piano-planning-service";
import {
  planPianoPhrase,
  type PianoPhrasePlan,
} from "../src/piano-phrase-fingering";
const input = (midi = 60): PianoPlanningInput => ({
  notes: [{ id: "n", hand: "right", midi, start: 0, duration: 1 }],
});
const deferred = () => {
  let resolve!: (plan: PianoPhrasePlan) => void;
  const promise = new Promise<PianoPhrasePlan>((r) => (resolve = r));
  return { promise, resolve };
};
test("planning cache keys own musical identity, profile and policy, not presentation", () => {
  assert.equal(
    pianoPlanningKey(input()),
    pianoPlanningKey({
      ...input(),
      profile: { model: "classic", bpm: 120, maxSpan: 7 },
    }),
  );
  assert.notEqual(pianoPlanningKey(input()), pianoPlanningKey(input(61)));
  assert.notEqual(
    pianoPlanningKey(input()),
    pianoPlanningKey({ ...input(), profile: { bpm: 80 } }),
  );
  assert.notEqual(
    pianoPlanningKey(input()),
    pianoPlanningKey(input(), "other-policy"),
  );
  for (const change of [
    { start: 1 },
    { duration: 2 },
    { notatedDuration: 2 },
    { finger: 3 },
    { voice: "other" },
    { phraseStart: true },
    { tieFrom: "prior" },
  ])
    assert.notEqual(
      pianoPlanningKey(input()),
      pianoPlanningKey({ notes: [{ ...input().notes[0], ...change }] }),
    );
});

test("plan cache evicts the least recently used musical input at its bound", async () => {
  let calls = 0;
  const service = createPianoPlanningService({
    maxEntries: 2,
    backend: async (i) => {
      calls++;
      return planPianoPhrase(i.notes);
    },
  });
  await service.request(input(60));
  await service.request(input(62));
  await service.request(input(60));
  await service.request(input(64));
  assert.equal(service.cacheSize, 2);
  assert.equal(calls, 3);
  await service.request(input(62));
  assert.equal(calls, 4);
});

test("oversized input preserves the core diagnostic without sorting or transferring notes", async () => {
  const service = createPianoPlanningService({
    backend: async () => {
      throw Error("Oversized input reached worker");
    },
  });
  const reply = await service.request({ notes: Array(8001).fill({}) });
  assert.equal(reply.status, "ready");
  if (reply.status === "ready") {
    assert.equal(reply.plan.status, "unsupported");
    assert.equal(reply.cached, false);
    assert.deepEqual(reply.plan.notes, []);
  }
  assert.equal(service.cacheSize, 0);
});
test("latest request wins, queued requests coalesce and caller mutations cannot poison cache", async () => {
  const calls: PianoPlanningInput[] = [],
    jobs: ReturnType<typeof deferred>[] = [];
  const service = createPianoPlanningService({
    backend: async (i) => {
      calls.push(i);
      const job = deferred();
      jobs.push(job);
      return job.promise;
    },
    maxEntries: 2,
  });
  const a = input(),
    first = service.request(a);
  a.notes[0].midi = 99;
  const second = service.request(input(62)),
    third = service.request(input(64));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].notes[0].midi, 60);
  jobs[0].resolve(planPianoPhrase(input().notes));
  assert.equal((await first).status, "stale");
  assert.equal((await second).status, "stale");
  // The next job starts from the observable coalesced continuation, no sleeps.
  await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].notes[0].midi, 64);
  jobs[1].resolve(planPianoPhrase(input(64).notes));
  const result = await third;
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw Error("Missing current plan");
  result.plan.notes[0].finger = 5;
  const cached = await service.request(input(64));
  assert.equal(cached.status, "ready");
  if (cached.status === "ready") {
    assert.ok(cached.cached);
    assert.notEqual(cached.plan.notes[0].finger, 5);
  }
});
test("invalidation prevents in-flight cache repopulation and current backend errors remain visible", async () => {
  const job = deferred(),
    service = createPianoPlanningService({ backend: () => job.promise });
  const pending = service.request(input());
  service.invalidate();
  job.resolve(planPianoPhrase(input().notes));
  assert.equal((await pending).status, "stale");
  assert.equal(service.cacheSize, 0);
  const broken = createPianoPlanningService({
    backend: async () => {
      throw Error("real failure");
    },
  });
  await assert.rejects(broken.request(input()), /real failure/);
});
test("worker replies are associated by request ID, policy mismatch and closure reject pending jobs", async () => {
  const messages: PianoWorkerRequest[] = [],
    listeners = new Map<string, Set<(e: Event) => void>>();
  let terminated = false;
  const worker: Parameters<typeof createPianoWorkerBackend>[0] = {
    postMessage(m: PianoWorkerRequest) {
      messages.push(m);
    },
    addEventListener(type, f) {
      const set = listeners.get(type) ?? new Set();
      set.add(f as (e: Event) => void);
      listeners.set(type, set);
    },
    removeEventListener(type, f) {
      listeners.get(type)?.delete(f as (e: Event) => void);
    },
    terminate() {
      terminated = true;
    },
  };
  const client = createPianoWorkerBackend(worker),
    a = client.backend(input()),
    b = client.backend(input(62));
  const reply = (r: PianoWorkerReply) =>
    listeners
      .get("message")
      ?.forEach((f) => f(new MessageEvent("message", { data: r })));
  reply({
    id: messages[1].id,
    ok: true,
    version: pianoPlanningVersion,
    plan: planPianoPhrase(input(62).notes),
  });
  assert.equal((await b).notes[0].midi, 62);
  const rejected = assert.rejects(a, /policy mismatch/);
  reply({
    id: messages[0].id,
    ok: true,
    version: "old",
    plan: planPianoPhrase(input().notes),
  });
  await rejected;
  const pending = client.backend(input());
  const closed = assert.rejects(pending, /closed/);
  client.close();
  await closed;
  assert.ok(terminated);
  assert.equal(
    [...listeners.values()].reduce((s, v) => s + v.size, 0),
    0,
  );
  await assert.rejects(client.backend(input()), /closed/);
});
test("cache canonicalizes layout order while preserving returned source order and rejecting invalid ties", async () => {
  const a = {
      id: "a",
      hand: "right" as const,
      midi: 60,
      start: 0,
      duration: 1,
    },
    b = { id: "b", hand: "left" as const, midi: 48, start: 0, duration: 1 };
  let calls = 0;
  const service = createPianoPlanningService({
    backend: async (i) => {
      calls++;
      return planPianoPhrase(i.notes);
    },
  });
  const first = await service.request({ notes: [a, b] });
  assert.equal(first.status, "ready");
  const second = await service.request({ notes: [b, a] });
  assert.equal(second.status, "ready");
  if (second.status === "ready")
    assert.deepEqual(
      second.plan.notes.map((n) => n.id),
      ["b", "a"],
    );
  assert.equal(calls, 1);
  const tied = {
    id: "tie",
    hand: "right" as const,
    midi: 60,
    start: 1,
    duration: 1,
    tieFrom: "a",
  };
  await service.request({ notes: [a, tied] });
  const reordered = await service.request({ notes: [tied, a] });
  assert.equal(reordered.status, "ready");
  if (reordered.status === "ready")
    assert.deepEqual(
      reordered.plan.notes.map((n) => n.id),
      ["tie", "a"],
    );
  await assert.rejects(
    service.request({ notes: [a, { ...tied, tieFrom: "missing" }] }),
    /tie/,
  );
  await assert.rejects(
    service.request({
      ...input(),
      profile: { model: null as unknown as "classic" },
    }),
    /profile/,
  );
});

test("worker execution and decoding failures retain their cause and reject every pending and future job", async () => {
  for (const type of ["error", "messageerror"] as const) {
    const events = new EventTarget();
    let terminated = false;
    const client = createPianoWorkerBackend({
      postMessage() {},
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      terminate() {
        terminated = true;
      },
    });
    const a = assert.rejects(client.backend(input()), new RegExp(type));
    const b = assert.rejects(client.backend(input(62)), new RegExp(type));
    events.dispatchEvent(new Event(type, { cancelable: true }));
    await Promise.all([a, b]);
    assert.ok(terminated);
    await assert.rejects(client.backend(input()), new RegExp(type));
  }
});
