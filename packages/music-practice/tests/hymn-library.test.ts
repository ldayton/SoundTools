import test from "node:test";
import assert from "node:assert/strict";
import hymns from "../src/hymns.json";
import { hymnLibrary } from "../src/hymn-library";
import { HymnProgress, type HymnState } from "../src/hymn-progress";
import { hymnPreferences } from "../src/hymn-settings";
import { migrateLegacy } from "../src/durable-state";
import {
  songalongRecords,
  restoreSongalongRecords,
  songalongLiveKeys,
} from "../src/songalong-account-records";

test("library is alphabetical within favorite and ordinary groups without changing the catalog", () => {
  const songs = Object.freeze([
    { id: "z", title: "Zion", aliases: ["Home"] },
    { id: "in", title: "In Christ Alone" },
    { id: "amazing", title: "Amazing Grace" },
    { id: "ill", title: "I'll Fly Away" },
  ]);
  assert.deepEqual(
    hymnLibrary(songs, "", {}).map((s) => s.id),
    ["amazing", "ill", "in", "z"],
  );
  assert.deepEqual(
    hymnLibrary(songs, "", { z: true, in: true, amazing: false }).map(
      (s) => s.id,
    ),
    ["in", "z", "amazing", "ill"],
  );
  assert.deepEqual(
    hymnLibrary(songs, "i", { z: true, in: true }).map((s) => s.id),
    ["in", "z", "amazing", "ill"],
  );
  assert.equal(hymnLibrary(songs, "home", {})[0].id, "z");
  assert.deepEqual(
    songs.map((s) => s.id),
    ["z", "in", "amazing", "ill"],
  );
});

test("favorites survive saves, removals and individual cloud records; legacy saves start empty", () => {
  const ids = hymns.map((h) => h.id),
    current = ids[0],
    other = ids[1];
  const progress = new HymnProgress(undefined, ids);
  assert.deepEqual(progress.favorites, {});
  progress.favorites[current] = true;
  progress.favorites[other] = false;
  const saved = progress.snapshot(hymnPreferences(current), "C", 1);
  assert.deepEqual(new HymnProgress(saved, ids).favorites, {
    [current]: true,
    [other]: false,
  });
  const state = migrateLegacy({});
  state.activities.sight = saved;
  const records = songalongRecords(state);
  assert.equal(records[`favorites:${current}`], true);
  assert.equal(records[`favorites:${other}`], false);
  const restored = restoreSongalongRecords(records).activities
    .sight as HymnState;
  assert.deepEqual(
    new HymnProgress(restored, ids).favorites,
    progress.favorites,
  );
  delete records[`favorites:${current}`];
  const removed = restoreSongalongRecords(records).activities
    .sight as HymnState;
  assert.equal(new HymnProgress(removed, ids).favorites[current], undefined);
  assert.deepEqual(
    new HymnProgress({ ...saved, favorites: undefined }, ids).favorites,
    {},
  );
});

test("remote favorites apply immediately without changing active song preferences or playback progress", () => {
  const ids = hymns.map((h) => h.id),
    current = ids[0],
    other = ids[1];
  const progress = new HymnProgress(undefined, ids);
  const saved = progress.snapshot(
    { ...hymnPreferences(current), mode: "playback", bpm: 96, position: 3 },
    "C",
    1,
  );
  progress.favorites[current] = true;
  progress.mergeInactive(
    {
      ...saved,
      favorites: {
        [current]: false,
        [other]: true,
        unknown: true,
        [ids[2]]: "invalid",
      } as any,
    },
    current,
  );
  assert.deepEqual(progress.favorites, { [current]: false, [other]: true });
  assert.equal(progress.forHymn(current).bpm, 96);
  assert.equal(progress.forHymn(current).mode, "playback");
  assert.deepEqual(
    songalongLiveKeys(
      [
        `favorites:${current}`,
        `favorites:${other}`,
        `hymn:${current}:bpm`,
        `hymn:${other}:bpm`,
        "current:hymn",
      ],
      current,
    ),
    [`favorites:${current}`, `favorites:${other}`, `hymn:${other}:bpm`],
  );
});

test("leading The does not affect song order or search, including inside favorites",()=>{
 const songs=[{id:"old",title:"The Old Rugged Cross"},{id:"silent",title:"Silent Night"},{id:"come",title:"O Come, All Ye Faithful"},{id:"theatre",title:"Theatre Song"},{id:"lower",title:"the Amazing Song"}];
 assert.deepEqual(hymnLibrary(songs,"",{}).map(h=>h.id),["lower","come","old","silent","theatre"]);
 assert.deepEqual(hymnLibrary(songs,"",{old:true,come:true}).map(h=>h.id),["come","old","lower","silent","theatre"]);
 assert(hymnLibrary(songs,"the old",{}).some(h=>h.title==="The Old Rugged Cross"));
});
