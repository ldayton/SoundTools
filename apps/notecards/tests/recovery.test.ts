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
  type PersistenceAdapter,
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
  async write(expected: number, owner: string, state: StoredState) {
    if (this.fail) throw Error("quota");
    if (this.value?.revision !== expected || this.value.owner !== owner)
      throw Error("stale writer");
    this.value = copy(state);
  }
}
test("atomic answer/checkpoint, switching activity, failure and stale writers", async () => {
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
  await assert.rejects(a.save(), /stale/);
  assert.equal(adapter.value!.owner, "b");
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
