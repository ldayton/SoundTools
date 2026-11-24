import {practiceHymn,otherPracticeHymn} from "../../../packages/music-practice/test-fixtures/hymns";
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
    ...hymnPreferences(practiceHymn.id),
    key: "B" as const,
    octave: -1,
    low: 38,
    high: 79,
    stanzas: [1, 2],
    arrangement: "piano" as const,
    hands: "left" as const,
    viewHands: "both" as const,
    position: 5,
  };
  progress.snapshot(first, practiceHymn.key, 1.2, {
    content: "score-1",
    length: 35,
    paused: true,
  });
  const second = {
    ...hymnPreferences(otherPracticeHymn.id),
    mode: "playback" as const,
    bpm: 125,
    position: 2,
  };
  state.activities.sight = progress.snapshot(second, otherPracticeHymn.key, 1.3, {
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
  assert.deepEqual(loaded.restore(first, practiceHymn.key, "score-1", 35), {
    position: 5,
    paused: true,
  });
  assert.deepEqual(
    loaded.restore({ ...first, hands: "right" }, practiceHymn.key, "score-1", 35),
    { position: 0, paused: false },
  );
  assert.deepEqual(restored.activities.audio, { version: 1, volume: 33 });
  const next = structuredClone(records);
  next[`hymn:${first.hymn}:pitch`] = { key: "D", octave: 0, low: 48, high: 84 };
  assert.deepEqual(
    changes(records, next).map((change) => change.key),
    [`hymn:${first.hymn}:pitch`],
  );
  assert.throws(
    () => restoreSongalongRecords({ ...records, schema: 3 }),
    /Update this app/,
  );
});

test("cloud roundtrips a global range, independent song tempos, and layout staff sizes", () => {
  const state = migrateLegacy({});
  const progress = new HymnProgress(undefined, []);
  const first = {
    ...hymnPreferences(practiceHymn.id),
    low: 48,
    high: 79,
    bpm: 96,
  };
  progress.remember(first, 1.2, "desktop");
  const second = { ...progress.forHymn(otherPracticeHymn.id), high: null, bpm: 112 };
  state.activities.sight = progress.snapshot(
    second,
    otherPracticeHymn.key,
    0.8,
    undefined,
    "mobile",
  );
  const records = songalongRecords(state);
  assert.equal(records["current:low"], 48);
  assert.equal(records["current:high"], null);
  assert.deepEqual(records[`hymn:${first.hymn}:pitch`], { key: "original" });
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
    [`hymn:${practiceHymn.slug}:pitch`]: { key: practiceHymn.key, low: 50, high: 81 },
  });
  const migrated = new HymnProgress(legacy.activities.sight as any, [
    first.hymn,
  ]);
  assert.equal(migrated.forHymn(otherPracticeHymn.id).low, 50);
  assert.equal(migrated.forHymn(otherPracticeHymn.id).high, 81);
});

test("independent layout and presentation edits use separate cloud records, with legacy fallback",()=>{
  const state=migrateLegacy({}),progress=new HymnProgress(undefined,[practiceHymn.id]);
  state.activities.sight=progress.snapshot(hymnPreferences(practiceHymn.id),practiceHymn.key,1);
  state.activities.presentation={version:1,fingerings:false,pianoVisible:true,staffSpacingByLayout:{mobile:100,desktop:100}};
  const base=songalongRecords(state),desktop=structuredClone(state),phone=structuredClone(state);
  (desktop.activities.sight as any).zoomByLayout.desktop=1.3;
  (phone.activities.sight as any).zoomByLayout.mobile=.8;
  (desktop.activities.presentation as any).fingerings=true;
  (phone.activities.presentation as any).pianoVisible=false;
  const a=changes(base,songalongRecords(desktop)),b=changes(base,songalongRecords(phone));
  assert.deepEqual(a.map(c=>c.key).sort(),["activity:presentation:fingerings","current:zoomByLayout:desktop"]);
  assert.deepEqual(b.map(c=>c.key).sort(),["activity:presentation:pianoVisible","current:zoomByLayout:mobile"]);
  const merged={...base,...Object.fromEntries([...a,...b].map(c=>[c.key,c.value]))};
  const restored=restoreSongalongRecords(merged);
  assert.deepEqual((restored.activities.sight as any).zoomByLayout,{mobile:.8,desktop:1.3});
  assert.deepEqual(restored.activities.presentation,{version:1,fingerings:true,pianoVisible:false,staffSpacingByLayout:{mobile:100,desktop:100}});
  const legacy=restoreSongalongRecords({schema:1,"current:hymn":practiceHymn.id,"activity:presentation":{version:1,fingerings:false,pianoVisible:true},"current:zoomByLayout":{mobile:1,desktop:1},"activity:presentation:fingerings":true,"current:zoomByLayout:mobile":.8});
  assert.equal((legacy.activities.presentation as any).fingerings,true);assert.equal((legacy.activities.presentation as any).pianoVisible,true);
  assert.deepEqual((legacy.activities.sight as any).zoomByLayout,{mobile:.8,desktop:1});
});

test("the new cloud format imports legacy data and stops older readers from overwriting split settings",async()=>{
  const {checkSchema}=await import("@ldayton/account/model");
  const migrated=songalongRecords(restoreSongalongRecords({schema:1,"current:hymn":practiceHymn.id,"activity:presentation":{version:1,fingerings:true},"current:zoomByLayout":{mobile:.8,desktop:1.3}}));
  assert.equal(migrated.schema,2);assert.equal(migrated["activity:presentation:fingerings"],true);
  assert.equal(migrated["current:zoomByLayout:mobile"],.8);
  assert.throws(()=>checkSchema(migrated),/Update this app/);
  assert.doesNotThrow(()=>restoreSongalongRecords(migrated));
});
