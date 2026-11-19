import test from "node:test";
import assert from "node:assert/strict";
import {
  songalongRecords,
  restoreSongalongRecords,
} from "../../../packages/music-practice/src/songalong-account-records";
import { migrateLegacy } from "../../../packages/music-practice/src/durable-state";
import { HymnProgress } from "../../../packages/music-practice/src/hymn-progress";
import { hymnPreferences } from "../../../packages/music-practice/src/hymn-settings";
import { changes } from "@ldayton/account/sync";
test("cloud records preserve all hymn preferences and content-checked checkpoints, excluding device data", () => {
  const state = migrateLegacy({});
  const progress = new HymnProgress(undefined, []);
  const first = {
    ...hymnPreferences("amazing-grace"),
    key: "B" as const,
    octave: -1,
    low: 38,
    high: 79,
    stanzas: [1, 2],
    arrangement: "bass" as const,
    hands: "left" as const,
    viewHands: "both" as const,
    position: 5,
  };
  progress.snapshot(first, "G", 1.2, {
    content: "score-1",
    length: 35,
    paused: true,
  });
  const second = {
    ...hymnPreferences("jesus-loves-me"),
    mode: "playback" as const,
    bpm: 125,
    position: 2,
  };
  state.activities.sight = progress.snapshot(second, "C", 1.3, {
    content: "score-2",
    length: 42,
    paused: true,
  });
  state.activities.audio = { version: 1, volume: 33 };
  state.activities.presentation = { version: 1, pianoVisible: false };
  state.activities.midi = { version: 1, device: "private-device" };
  const records = songalongRecords(state);
  const restored = restoreSongalongRecords(records);
  assert.deepEqual(songalongRecords(restored), records);
  assert.equal(restored.activities.midi, undefined);
  const loaded = new HymnProgress(restored.activities.sight as any, [
    first.hymn,
    second.hymn,
  ]);
  assert.equal(loaded.forHymn(first.hymn).key, "B");
  assert.equal(loaded.forHymn(first.hymn).octave, -1);
  assert.deepEqual(loaded.forHymn(first.hymn).stanzas, [1, 2]);
  assert.deepEqual(loaded.restore(first, "G", "score-1", 35), {
    position: 5,
    paused: true,
  });
  assert.deepEqual(
    loaded.restore({ ...first, hands: "right" }, "G", "score-1", 35),
    { position: 0, paused: false },
  );
  assert.deepEqual(restored.activities.audio, { version: 1, volume: 33 });
  const next = structuredClone(records);
  next["hymn:amazing-grace:pitch"] = { key: "D", octave: 0, low: 48, high: 84 };
  assert.deepEqual(
    changes(records, next).map((change) => change.key),
    ["hymn:amazing-grace:pitch"],
  );
  assert.throws(
    () => restoreSongalongRecords({ ...records, schema: 2 }),
    /Update this app/,
  );
});

test("cloud roundtrips a global range, independent song tempos, and layout staff sizes", () => {
  const state = migrateLegacy({});
  const progress = new HymnProgress(undefined, []);
  const first = {
    ...hymnPreferences("amazing-grace"),
    low: 48,
    high: 79,
    bpm: 96,
  };
  progress.remember(first, 1.2, "desktop");
  const second = { ...progress.forHymn("silent-night"), high: null, bpm: 112 };
  state.activities.sight = progress.snapshot(
    second,
    "C",
    0.8,
    undefined,
    "mobile",
  );
  const records = songalongRecords(state);
  assert.equal(records["current:low"], 48);
  assert.equal(records["current:high"], null);
  assert.deepEqual(records["hymn:amazing-grace:pitch"], { key: "original" });
  const restored = restoreSongalongRecords(records);
  const loaded = new HymnProgress(restored.activities.sight as any, [
    first.hymn,
    second.hymn,
  ]);
  for (const id of [first.hymn, second.hymn]) {
    assert.equal(loaded.forHymn(id).low, 48);
    assert.equal(loaded.forHymn(id).high, null);
  }
  assert.equal(loaded.forHymn(first.hymn).bpm, 96);
  assert.equal(loaded.forHymn(second.hymn).bpm, 112);
  assert.equal(loaded.zoomFor("desktop"), 1.2);
  assert.equal(loaded.zoomFor("mobile"), 0.8);
  assert.deepEqual(songalongRecords(restored), records);
  const legacy = restoreSongalongRecords({
    schema: 1,
    "current:hymn": first.hymn,
    "hymn:amazing-grace:pitch": { key: "G", low: 50, high: 81 },
  });
  const migrated = new HymnProgress(legacy.activities.sight as any, [
    first.hymn,
  ]);
  assert.equal(migrated.forHymn("silent-night").low, 50);
  assert.equal(migrated.forHymn("silent-night").high, 81);
});
