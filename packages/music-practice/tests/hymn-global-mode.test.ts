import test from "node:test";
import assert from "node:assert/strict";
import hymns from "../src/hymns.json";
import { HymnProgress } from "../src/hymn-progress";
import { hymnPreferences } from "../src/hymn-settings";
import {
  songalongRecords,
  restoreSongalongRecords,
} from "../src/songalong-account-records";
import { migrateLegacy } from "../src/durable-state";
test("playback mode is global across saved/new songs, reloads and account round trips", () => {
  const ids = hymns.slice(0, 3).map((h) => h.id);
  const progress = new HymnProgress(undefined, ids);
  progress.remember(
    { ...hymnPreferences(ids[0]), mode: "playback", bpm: 96 },
    1,
  );
  assert.equal(progress.forHymn(ids[1]).mode, "playback");
  progress.remember({ ...progress.forHymn(ids[1]), mode: "wait", bpm: 112 }, 1);
  assert.equal(progress.forHymn(ids[0]).mode, "wait");
  assert.equal(progress.forHymn(ids[0]).bpm, 96);
  const settings = { ...progress.forHymn(ids[0]), mode: "playback" as const };
  const snapshot = progress.snapshot(settings, "C", 1);
  assert.equal(
    new HymnProgress(snapshot, ids).forHymn(ids[1]).mode,
    "playback",
  );
  const state = migrateLegacy({});
  state.activities.sight = snapshot;
  const records = songalongRecords(state);
  assert.equal(records["current:mode"], "playback");
  assert.ok(
    !Object.keys(records).some(
      (k) => k.startsWith("hymn:") && k.endsWith(":mode"),
    ),
  );
  const restored = restoreSongalongRecords(records);
  const saved = restored.activities.sight as typeof snapshot;
  assert.equal(new HymnProgress(saved, ids).forHymn(ids[2]).mode, "playback");
});
