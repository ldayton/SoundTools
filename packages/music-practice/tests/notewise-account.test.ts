import test from "node:test";
import assert from "node:assert/strict";
import {
  NotewiseAccountRecords,
  restoreNotewiseRecords,
} from "../src/notewise-account-records";
import { migrateLegacy } from "../src/durable-state";
const stats = (attempts = 2, correct = 1, lastSeen = 100) => ({
  attempts,
  correct,
  streak: correct,
  lastSeen,
  due: lastSeen + 1000,
});
const card = "staff:C4:0";
test("NoteWise settings, active exercise and checkpoints round trip without local privacy/device data", () => {
  const state = migrateLegacy({});
  state.progress.mode = "piano";
  state.progress.roundLength = 24;
  state.progress.profiles.piano.low = "D4";
  state.progress.stats[card] = stats();
  state.activities.rhythm = { version: 1, level: "pulse" };
  state.activities["backing-track"] = { version: 1, metronomeEnabled: true };
  state.activities["guitar-scales"] = {version:1,settings:{tonic:7,quality:"major",wholeRoute:true}};
  state.activities.audio = { version: 1, volume: 0.3 };
  state.activities["backing-mixer:folk"] = {
    version: 1,
    levels: { bass: 0, metronome: 65 },
  };
  state.activities["backing-mixer:gospel"] = {
    version: 1,
    levels: { organ: 140 },
  };
  state.activities["diagnostic-consent"] = { version: 1, sharing: true };
  state.legacy.secret = "recovery";
  const records = new NotewiseAccountRecords().read(state);
  const restored = restoreNotewiseRecords(records);
  assert.equal(restored.progress.mode, "piano");
  assert.equal(restored.progress.roundLength, 24);
  assert.equal(restored.progress.profiles.piano.low, "D4");
  assert.deepEqual(restored.progress.stats[card], state.progress.stats[card]);
  assert.deepEqual(restored.activities.rhythm, state.activities.rhythm);
  assert.deepEqual(restored.activities["guitar-scales"],state.activities["guitar-scales"]);
  assert.deepEqual(
    restored.activities["backing-track"],
    state.activities["backing-track"],
  );
  for (const genre of ["folk", "gospel"])
    assert.deepEqual(
      restored.activities[`backing-mixer:${genre}`],
      state.activities[`backing-mixer:${genre}`],
    );
  assert(!JSON.stringify(records).includes("recovery"));
  assert(!("activity:diagnostic-consent" in records));
});
test("same-card attempts on two offline devices add, repeated reads do not double count, and validation does not change baselines", () => {
  const initial = migrateLegacy({});
  initial.progress.stats[card] = stats();
  const seed = new NotewiseAccountRecords().read(initial);
  const a = new NotewiseAccountRecords(),
    b = new NotewiseAccountRecords();
  const sa = restoreNotewiseRecords(seed),
    sb = restoreNotewiseRecords(seed);
  a.accept(seed, sa);
  b.accept(seed, sb);
  sa.progress.stats[card] = stats(3, 2, 200);
  sb.progress.stats[card] = stats(4, 2, 300);
  const ra = a.read(sa, "device-a"),
    rb = b.read(sb, "device-b");
  assert.deepEqual(a.read(sa, "device-a"), ra);
  const merged = {
    ...ra,
    ...Object.fromEntries(
      Object.entries(rb).filter(([k]) => k.endsWith(":device-b")),
    ),
  };
  assert.equal(restoreNotewiseRecords(merged).progress.stats[card].attempts, 5);
  assert.equal(restoreNotewiseRecords(merged).progress.stats[card].correct, 3);
  // Pure preflight validation cannot consume a not-yet-saved local attempt.
  restoreNotewiseRecords(merged);
  sa.progress.stats[card] = stats(4, 3, 400);
  assert.equal(
    (a.read(sa, "device-a")["stat:" + card + ":device-a"] as any).attempts,
    2,
  );
  const cloud = restoreNotewiseRecords(merged);
  a.accept(merged, cloud);
  cloud.progress.stats[card] = stats(6, 4, 500);
  assert.equal(
    restoreNotewiseRecords(a.read(cloud, "device-a")).progress.stats[card]
      .attempts,
    6,
  );
  a.accept(null, initial);
  assert.deepEqual(a.read(initial), seed);
});
test("future schemas and corrupt practice contributions are rejected", () => {
  const records = new NotewiseAccountRecords().read(migrateLegacy({}));
  assert.throws(() => restoreNotewiseRecords({ ...records, schema: 2 }));
  assert.throws(() =>
    restoreNotewiseRecords({
      ...records,
      ["stat:" + card + ":x"]: stats(1, 2),
    }),
  );
  assert.throws(() =>
    restoreNotewiseRecords({
      ...records,
      "activity:patterns": { version: 999 },
    }),
  );
  assert.throws(() =>
    restoreNotewiseRecords({
      ...records,
      "activity:backing-mixer:future-genre": { version: 1, levels: {} },
    }),
  );
});
