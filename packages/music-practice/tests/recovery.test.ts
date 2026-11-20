import { test } from "node:test";
import assert from "node:assert/strict";
import { PracticeSession } from "../src/session";
import { defaultProgress } from "../src/progress";
import { pianoDeck } from "../src/piano-model";
import { pianoNotation } from "../src/piano-notation";
import {
  decodeState,
  migrateLegacy,
  DurableStore,
  mergeWindowState,
  type PersistenceAdapter,
  type DurableState,
  type StoredState,
} from "../src/durable-state";
import { restoreBookmark, bookmark } from "../src/bookmarks";
const copy = <T>(x: T): T => structuredClone(x);
function setup() {
  const progress = defaultProgress();
  const profile = progress.profiles.piano;
  Object.assign(profile, { low: "B3", high: "D4", overlapPractice: "both" });
  const pool = pianoDeck(profile);
  const s = new PracticeSession(pool, progress, "piano-staff:");
  s.next(() => 0);
  s.representation = pianoNotation(s.current!, profile, () => 0);
  return { progress, pool, s };
}
test("unanswered card and exact alternative notation survive serialization", () => {
  const { progress, pool, s } = setup();
  const snapshot = JSON.parse(JSON.stringify(s.snapshot()));
  const restored = PracticeSession.restore(
    pool,
    progress,
    "piano-staff:",
    snapshot,
  )!;
  assert.ok(restored);
  assert.deepEqual(restored.current, s.current);
  assert.deepEqual(restored.representation, s.representation);
  assert.equal(restored.accepting, true);
  assert.deepEqual(restored.snapshot(), snapshot);
});
test("feedback resumes without grading twice and completion remains complete", () => {
  const { progress, pool, s } = setup();
  s.submit(false, 1234);
  s.feedback = { correct: false, text: "Try again" };
  const restored = PracticeSession.restore(
    pool,
    progress,
    "piano-staff:",
    s.snapshot(),
  )!;
  assert.equal(restored.accepting, false);
  assert.equal(restored.submit(true, 9999), false);
  assert.equal(progress.stats["piano-staff:" + s.current!.id].attempts, 1);
  assert.deepEqual(restored.feedback, s.feedback);
  for (let i = 1; i < 12; i++) {
    restored.next(() => 0.4);
    restored.submit(true, 1234);
  }
  restored.next();
  const done = PracticeSession.restore(
    pool,
    progress,
    "piano-staff:",
    restored.snapshot(),
  )!;
  assert.equal(done.snapshot().phase, "complete");
  assert.equal(done.answered, 12);
  assert.equal(done.correct, 11);
});
test("retry, visits, recency and draw context survive reopening and continuing a round", () => {
  const { progress, pool, s } = setup();
  for (let i = 0; i < 12; i++) {
    if (i) s.next(() => 0.7);
    s.submit(i % 3 === 0, 1234);
  }
  s.next();
  const restored = PracticeSession.restore(
    pool,
    progress,
    "piano-staff:",
    s.snapshot(),
  )!;
  assert.deepEqual(restored.choices(2000), s.choices(2000));
  s.continueRound();
  restored.continueRound();
  assert.deepEqual(
    restored.next(() => 0.25),
    s.next(() => 0.25),
  );
  assert.deepEqual(restored.snapshot(), s.snapshot());
});
test("bad session versions, changed pools and impossible counters are rejected", () => {
  const { progress, pool, s } = setup();
  for (const patch of [
    { version: 999 },
    { answered: -1 },
    { current: "missing" },
    { correct: 20 },
    { phase: "oops" },
  ])
    assert.equal(
      PracticeSession.restore(pool, progress, "piano-staff:", {
        ...s.snapshot(),
        ...patch,
      }),
      null,
    );
  assert.equal(
    PracticeSession.restore(
      pool.slice(1),
      progress,
      "piano-staff:",
      s.snapshot(),
    ),
    null,
  );
});
class MemoryAdapter implements PersistenceAdapter {
  value: StoredState | null = null;
  fail = false;
  async read() {
    return copy(this.value);
  }
  async claim(owner: string, initial: StoredState) {
    this.value = { ...copy(this.value || initial), owner };
    return copy(this.value);
  }
  async commit(owner: string, base: DurableState, snapshot: DurableState) {
    if (this.fail) throw Error("quota");
    this.value = {
      revision: this.value!.revision + 1,
      owner,
      state: mergeWindowState(base, snapshot, this.value!.state),
    };
  }
}
test("atomic answer/checkpoint, switching activity, failure and concurrent windows", async () => {
  const adapter = new MemoryAdapter();
  const initial = migrateLegacy({});
  const a = await DurableStore.open(adapter, initial, "a");
  const { s, progress } = setup();
  s.submit(true, 1234);
  a.state.progress = progress;
  a.state.activities.piano = { version: 1, session: s.snapshot() };
  await a.save();
  const committed = copy(adapter.value);
  a.state.progress.mode = "sight";
  a.state.activities.sight = { version: 1, position: 3, paused: true };
  await a.save();
  const b = await DurableStore.open(adapter, initial, "b");
  assert.deepEqual(b.state.activities.piano, a.state.activities.piano);
  assert.deepEqual(b.state.activities.sight, {
    version: 1,
    position: 3,
    paused: true,
  });
  await a.save();
  assert.equal(adapter.value!.owner, "a");
  adapter.fail = true;
  b.state.progress.stats = {};
  await assert.rejects(b.save(), /quota/);
  assert.deepEqual(
    adapter.value!.state.progress.stats,
    committed!.state.progress.stats,
  );
});
test("legacy migration retains review history and hymn data once; corrupt/future envelopes are not overwritten", () => {
  const p = defaultProgress();
  p.stats["staff:C4:0"] = {
    attempts: 2,
    correct: 1,
    streak: 0,
    lastSeen: 123,
    due: 0,
  };
  const state = migrateLegacy({
    progress: JSON.stringify(p),
    sight: JSON.stringify({ hymn: "amazing-grace", chords: true, position: 3 }),
  });
  assert.deepEqual(state.progress.stats, p.stats);
  assert.equal((state.legacy.sight as any).position, 3);
  assert.throws(() => decodeState({ version: 999 }), /version/);
  assert.throws(() => decodeState({ version: 1, progress: null }), /invalid/i);
});
test("bookmarks are independent per arrangement and preserve pause/completion only for matching content", () => {
  const a = bookmark("score-v1", 3, true, 3);
  const b = bookmark("other-score", 1, false, 4);
  const saved = { "hymn:melody": a, "hymn:original": b };
  assert.deepEqual(restoreBookmark(saved["hymn:melody"], "score-v1", 3), {
    position: 3,
    paused: true,
  });
  assert.deepEqual(restoreBookmark(saved["hymn:original"], "other-score", 4), {
    position: 1,
    paused: false,
  });
  assert.deepEqual(restoreBookmark(a, "changed-score", 4), {
    position: 0,
    paused: false,
  });
  assert.deepEqual(restoreBookmark({ ...a, position: 100 }, "score-v1", 3), {
    position: 0,
    paused: false,
  });
});
test("an activity retains its own round length when another activity changes the default", () => {
  const { progress, pool, s } = setup();
  const snapshot = s.snapshot();
  progress.roundLength = 24;
  const restored = PracticeSession.restore(
    pool,
    progress,
    "piano-staff:",
    snapshot,
  )!;
  assert.equal(restored.length, 12);
  assert.deepEqual(restored.current, s.current);
});
test("a newer legacy schema cannot be downgraded to empty defaults", () => {
  assert.throws(
    () => migrateLegacy({ progress: JSON.stringify({ version: 6 }) }),
    /version/,
  );
});

test("two-bar pattern checkpoints survive shared storage validation without allowing unknown versions", () => {
  const state = migrateLegacy({});
  state.activities.patterns = {
    version: 2,
    notes: [60, 62, 64, 65, 67, 65, 64, 62],
    position: 3,
    paused: false,
  };
  assert.deepEqual(
    decodeState(state).activities.patterns,
    state.activities.patterns,
  );
  state.activities.rhythm = { version: 2 };
  assert.throws(() => decodeState(state), /Unsupported activity version/);
  delete state.activities.rhythm;
  state.activities.patterns = { version: 3 };
  assert.throws(() => decodeState(state), /Unsupported activity version/);
});

test("stale windows preserve other activities, settings and both answers to the same card", async () => {
  const adapter = new MemoryAdapter();
  const initial = migrateLegacy({});
  const a = await DurableStore.open(adapter, initial, "a");
  const b = await DurableStore.open(adapter, initial, "b");
  a.state.activities["guitar-scales"] = { version: 1, settings: { tonic: 2 } };
  b.state.activities.rhythm = { version: 1, bars: [1, 2] };
  a.state.progress.roundLengths!.piano = 24;
  b.state.progress.roundLengths!.staff = 6;
  const id = "staff:C4:0";
  a.state.progress.stats[id] = {
    attempts: 1,
    correct: 1,
    streak: 1,
    lastSeen: 100,
    due: 1000,
  };
  b.state.progress.stats[id] = {
    attempts: 1,
    correct: 0,
    streak: 0,
    lastSeen: 200,
    due: 200,
  };
  await Promise.all([a.save(), b.save()]);
  assert.deepEqual(adapter.value!.state.activities, {
    ...a.state.activities,
    ...b.state.activities,
  });
  assert.equal(adapter.value!.state.progress.roundLengths!.piano, 24);
  assert.equal(adapter.value!.state.progress.roundLengths!.staff, 6);
  assert.deepEqual(adapter.value!.state.progress.stats[id], {
    attempts: 2,
    correct: 1,
    streak: 0,
    lastSeen: 200,
    due: 200,
  });
  // A stale, unrelated save must not roll back B's newer checkpoint.
  b.state.activities.rhythm = { version: 1, bars: [3, 4] };
  await b.save();
  a.state.progress.mode = "piano";
  await a.save();
  assert.deepEqual(adapter.value!.state.activities.rhythm, {
    version: 1,
    bars: [3, 4],
  });
  a.state.progress.stats[id].attempts++;
  a.state.progress.stats[id].correct++;
  a.state.progress.stats[id].lastSeen = 300;
  await a.save();
  assert.equal(adapter.value!.state.progress.stats[id].attempts, 3);
  assert.equal(adapter.value!.state.progress.stats[id].correct, 2);
});

test("queued edits preserve checkpoint boundaries and failed saves never resume silently", async () => {
  const adapter = new MemoryAdapter();
  const a = await DurableStore.open(adapter, migrateLegacy({}), "a");
  a.state.activities.piano = {
    version: 1,
    session: { current: 1, answered: 0 },
  };
  const first = a.save();
  a.state.activities.piano = {
    version: 1,
    session: { current: 2, answered: 1 },
  };
  const second = a.save();
  await Promise.all([first, second]);
  assert.deepEqual(
    adapter.value!.state.activities.piano,
    a.state.activities.piano,
  );
  adapter.fail = true;
  a.state.activities.piano = {
    version: 1,
    session: { current: 3, answered: 2 },
  };
  await assert.rejects(a.save(), /quota/);
  adapter.fail = false;
  await assert.rejects(a.save(), /quota/);
  assert.deepEqual(adapter.value!.state.activities.piano, {
    version: 1,
    session: { current: 2, answered: 1 },
  });
});

test("concurrent song windows retain per-song preferences and whole bookmarks", async () => {
  const adapter = new MemoryAdapter();
  const initial = migrateLegacy({});
  initial.activities.sight = {
    version: 1,
    hymn: "one",
    low: 48,
    preferences: { one: { bpm: 80 } },
    bookmarks: { one: { position: 1, paused: false } },
    zoomByLayout: { mobile: 1, desktop: 1 },
  };
  const a = await DurableStore.open(adapter, initial, "a");
  const b = await DurableStore.open(adapter, initial, "b");
  (a.state.activities.sight as any).low = 50;
  (a.state.activities.sight as any).preferences.one = { bpm: 90 };
  (a.state.activities.sight as any).bookmarks.one = {
    position: 2,
    paused: true,
  };
  (b.state.activities.sight as any).preferences.two = { bpm: 110 };
  (b.state.activities.sight as any).hymn = "two";
  (b.state.activities.sight as any).zoomByLayout.mobile = 1.2;
  await Promise.all([a.save(), b.save()]);
  const state = adapter.value!.state.activities.sight as any;
  assert.deepEqual(state.preferences, { one: { bpm: 90 }, two: { bpm: 110 } });
  assert.deepEqual(state.bookmarks.one, { position: 2, paused: true });
  assert.equal(state.zoomByLayout.mobile, 1.2);
  assert.equal(state.low, 50);
});
