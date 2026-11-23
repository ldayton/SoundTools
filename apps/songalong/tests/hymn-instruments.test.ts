import test from "node:test";
import assert from "node:assert/strict";
import {
  hymnInstrument,
  hymnInstrumentChoices,
  hymnInstrumentArrangements,
  selectHymnInstrument,
} from "../../../packages/music-practice/src/hymn-instruments";
import {
  hymnPreferences,
  hymnSettingsFromQuery,
} from "../../../packages/music-practice/src/hymn-settings";
import { instrumentEditionIds } from "../../../packages/music-practice/src/instrument-editions";
import { stagedHymn } from "../../../packages/music-practice/test-fixtures/hymns";
import {
  songalongRecords,
  restoreSongalongRecords,
} from "../../../packages/music-practice/src/songalong-account-records";
import { migrateLegacy } from "../../../packages/music-practice/src/durable-state";
import { HymnProgress } from "../../../packages/music-practice/src/hymn-progress";
test("all songs expose the same ordered primary instruments with explicit arrangement ownership", () => {
  assert.deepEqual(
    hymnInstrumentChoices.map((i) => [i.id, i.label]),
    [
      ["guitar", "Guitar"],
      ["piano", "Piano"],
      ["sung", "Sung accompaniment"],
    ],
  );
  assert.deepEqual(
    hymnInstrumentArrangements(stagedHymn, "piano").map((a) => a.id),
    ["melody", "bass", "chords", "broken"],
  );
  assert.deepEqual(
    hymnInstrumentArrangements(stagedHymn, "sung").map((a) => a.id),
    ["original"],
  );
  assert.deepEqual(hymnInstrumentArrangements(stagedHymn, "guitar"), []);
  for (const id of instrumentEditionIds) {
    assert.equal(hymnInstrumentArrangements({ id }, "piano").length, 1, id);
    assert.equal(hymnInstrumentArrangements({ id }, "guitar").length, 1, id);
    assert.equal(hymnInstrumentArrangements({ id }, "sung").length, 0, id);
  }
});
test("the teacher choir/organ arrangement is sung accompaniment, without invented instrumental editions", () => {
  const hymn = { id: "in-christ-alone-2" };
  assert.deepEqual(hymnInstrumentArrangements(hymn, "piano"), []);
  assert.deepEqual(hymnInstrumentArrangements(hymn, "guitar"), []);
  assert.equal(selectHymnInstrument(hymn, "original", "piano"), undefined);
  for (const input of [
    {},
    { arrangement: "melody" },
    { chords: false },
    { chords: true },
  ]) {
    const settings = hymnPreferences(hymn.id, input);
    assert.equal(settings.arrangement, "original");
    assert.equal(hymnInstrument(settings.arrangement), "sung");
  }
});
test("instrument switching is exclusive, preserves an eligible arrangement, and keeps old deep links meaningful", () => {
  assert.equal(selectHymnInstrument(stagedHymn, "chords", "piano"), "chords");
  assert.equal(selectHymnInstrument(stagedHymn, "chords", "sung"), "original");
  assert.equal(selectHymnInstrument(stagedHymn, "original", "piano"), "melody");
  for (const arrangement of [
    "melody",
    "bass",
    "chords",
    "broken",
    "original",
  ] as const) {
    const settings = hymnSettingsFromQuery(
      hymnPreferences(stagedHymn.id),
      new URLSearchParams({ arrangement }),
    );
    assert.equal(settings.arrangement, arrangement);
    assert.equal(
      hymnInstrument(settings.arrangement),
      arrangement === "original" ? "sung" : "piano",
    );
  }
});
test("instrument identity survives account/offline snapshots without a second conflicting selection field", () => {
  const state = migrateLegacy({});
  const progress = new HymnProgress(undefined, []);
  const settings = {
    ...hymnPreferences(stagedHymn.id),
    arrangement: "original" as const,
  };
  state.activities.sight = progress.snapshot(settings, stagedHymn.key, 1);
  const records = songalongRecords(state);
  const restored = restoreSongalongRecords(records);
  const loaded = new HymnProgress(restored.activities.sight as any, [
    stagedHymn.id,
  ]);
  assert.equal(
    hymnInstrument(loaded.forHymn(stagedHymn.id).arrangement),
    "sung",
  );
  assert.equal(records[`hymn:${stagedHymn.id}:arrangement`], "original");
  assert.deepEqual(songalongRecords(restored), records);
});
