import { canonicalHymnId } from "../../../packages/music-practice/src/hymn-identity";
import test from "node:test";
import assert from "node:assert/strict";
import {
  hymnInstrument,
  hymnHasVoice,
  hymnInstrumentChoices,
  hymnInstrumentArrangements,
  selectHymnInstrument,
} from "../../../packages/music-practice/src/hymn-instruments";
import {
  hymnPreferences,
  hymnSettingsFromQuery,
} from "../../../packages/music-practice/src/hymn-settings";
import { instrumentEditionIds, instrumentEdition } from "../../../packages/music-practice/src/instrument-editions";
import { practiceHymn } from "../../../packages/music-practice/test-fixtures/hymns";
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
    ],
  );
  assert.deepEqual(
    hymnInstrumentArrangements(practiceHymn, "piano").map((a) => a.id),
    ["original","piano"],
  );
  assert.deepEqual(hymnInstrumentArrangements(practiceHymn,"guitar").map(a=>a.id),["guitar-vocal","guitar-edition"]);
  for (const id of instrumentEditionIds) {
    assert.equal(hymnInstrumentArrangements({ id }, "piano").length, instrumentEdition({id})?.original ? 2 : 1, id);
    assert.equal(hymnInstrumentArrangements({ id }, "guitar").length, instrumentEdition({id})?.original ? 2 : 1, id);
  }
});
test("teacher score keeps Voice + Piano as default alongside adapted instrumental editions", () => {
  const hymn = {id:"in-christ-alone"};
  assert.equal(hymnPreferences(hymn.id).arrangement,"original");
  assert.equal(hymnPreferences(hymn.id,{arrangement:"original"}).arrangement,"original");
  assert.equal(hymnPreferences(hymn.id,{arrangement:"melody"}).arrangement,"piano");
  assert.equal(selectHymnInstrument(hymn,"original","piano"),"original");
  assert.equal(selectHymnInstrument(hymn,"piano","guitar"),"guitar-edition");
  assert.equal(selectHymnInstrument(hymn,"guitar-edition","piano",true),"original");
});
test("instrument switching is exclusive, preserves an eligible arrangement, and keeps old deep links meaningful", () => {
  assert.equal(selectHymnInstrument(practiceHymn, "chords", "piano"), "piano");
  assert.equal(selectHymnInstrument(practiceHymn, "chords", "piano",true), "original");
  assert.equal(selectHymnInstrument(practiceHymn, "original", "piano"), "original");
  for (const arrangement of [
    "melody",
    "bass",
    "chords",
    "broken",
    "original",
  ] as const) {
    const settings = hymnSettingsFromQuery(
      hymnPreferences(practiceHymn.id),
      new URLSearchParams({ arrangement }),
    );
    assert.equal(settings.arrangement, arrangement === "original" ? "original" : "piano");
    assert.equal(
      hymnInstrument(settings.arrangement),
      "piano",
    );
  }
});
test("instrument identity survives account/offline snapshots without a second conflicting selection field", () => {
  const state = migrateLegacy({});
  const progress = new HymnProgress(undefined, []);
  const settings = {
    ...hymnPreferences(practiceHymn.id),
    arrangement: "original" as const,
  };
  state.activities.sight = progress.snapshot(settings, practiceHymn.key, 1);
  const records = songalongRecords(state);
  const restored = restoreSongalongRecords(records);
  const loaded = new HymnProgress(restored.activities.sight as any, [
    practiceHymn.id,
  ]);
  assert.equal(
    hymnInstrument(loaded.forHymn(practiceHymn.id).arrangement),
    "piano",
  );
  assert(hymnHasVoice(loaded.forHymn(practiceHymn.id).arrangement));
  assert.equal(records[`hymn:${practiceHymn.id}:arrangement`], "original");
  assert.deepEqual(songalongRecords(restored), records);
});
