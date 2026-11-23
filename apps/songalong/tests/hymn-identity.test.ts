import test from "node:test";
import assert from "node:assert/strict";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  canonicalHymnId,
  migrateHymnIdentity,
} from "../../../packages/music-practice/src/hymn-identity";
import { hymnPreferences } from "../../../packages/music-practice/src/hymn-settings";
import { readRoute } from "../../../packages/music-practice/src/navigation";
import { migrateLegacy } from "../../../packages/music-practice/src/durable-state";
import {
  songalongRecords,
  restoreSongalongRecords,
} from "../../../packages/music-practice/src/songalong-account-records";
const slug: string = "in-christ-alone", id = canonicalHymnId(slug),
  retired = "in-christ-alone-2";
test("only the teacher score is catalogued, and its temporary deep link resolves to the canonical ID", () => {
  assert.equal(hymns.filter((h) => h.title === "In Christ Alone").length, 1);
  assert.equal(
    hymns.some((h) => h.id === retired),
    false,
  );
  const hymn = hymns.find((h) => h.id === id)!;
  assert.equal(hymn.source, "user-supplied-score");
  assert.equal(hymn.stanzas.length, 4);
  assert.equal(canonicalHymnId(retired), id);
  assert.equal(hymnPreferences(retired).hymn, id);
  const route = readRoute(
    new URL(
      "https://example.test/piano/hymns/" +
        retired +
        "?arrangement=guitar-edition",
    ),
    "sight",
    "songalong",
  );
  assert.equal(route.kind, "exercise");
  if (route.kind === "exercise") {
    assert.equal(route.hymn, id);
    assert.equal(route.query.get("arrangement"), "guitar-edition");
  }
});
test("teacher settings, favorites and checkpoint keys take precedence over retired music without mutating the save", () => {
  const raw = {
    version: 1,
    hymn: retired,
    stanzas: [2, 4],
    preferences: {
      [slug]: { hymn: slug, stanzas: [3], bpm: 70 },
      [retired]: {
        hymn: retired,
        stanzas: [2, 4],
        bpm: 96,
        showChordSymbols: false,
      },
    },
    favorites: { [slug]: false, [retired]: true },
    bookmarks: {
      [slug + ":original"]: { content: "old" },
      [retired + ":original"]: { content: "teacher" },
    },
    sections: { [retired + ":original"]: 2 },
  };
  const result = migrateHymnIdentity(raw);
  assert.equal(result.hymn, id);
  assert.deepEqual(result.stanzas, [2, 4]);
  assert.deepEqual(result.preferences[id], {
    hymn: id,
    stanzas: [2, 4],
    bpm: 96,
    showChordSymbols: false,
  });
  assert.equal(result.preferences[retired], undefined);
  assert.equal(result.favorites[id], true);
  assert.equal(result.favorites[retired], undefined);
  assert.deepEqual(result.bookmarks[id + ":original"], { content: "teacher" });
  assert.equal(result.sections[id + ":original"], 2);
  assert.deepEqual(migrateHymnIdentity(result), result);
  assert.equal(raw.hymn, retired);
});
test("old three-verse choices map to their matching teacher verses exactly once", () => {
  const result = migrateHymnIdentity({
    hymn: slug,
    stanzas: [1, 2, 3],
    stanza: 3,
    position: 40,
    section: 3,
    preferences: { [slug]: { stanzas: [2, 3] } },
  });
  assert.deepEqual(result.stanzas, [1, 3, 4]);
  assert.equal(result.stanza, 4);
  assert.equal(result.position, 0);
  assert.equal(result.section, 0);
  assert.deepEqual(result.preferences[id].stanzas, [3, 4]);
  assert.deepEqual(migrateHymnIdentity(result), result);
  assert.deepEqual(
    migrateHymnIdentity({ catalogueRevision: 1, hymn: id, stanzas: [2, 3] })
      .stanzas,
    [2, 3],
  );
});
test("offline/account snapshots promote teacher records and do not write its temporary ID back", () => {
  const state = migrateLegacy({});
  state.activities.sight = {
    version: 1,
    hymn: retired,
    arrangement: "original",
    preferences: {
      [retired]: {
        hymn: retired,
        arrangement: "original",
        bpm: 96,
        stanzas: [4],
        showChordSymbols: false,
      },
    },
    favorites: { [retired]: true },
  };
  const records = songalongRecords(state);
  assert.equal(records["current:hymn"], id);
  assert.equal(records[`hymn:${id}:bpm`], 96);
  assert(Object.keys(records).every((key) => !key.includes(retired)));
  const restored = restoreSongalongRecords(records).activities.sight as any;
  assert.equal(restored.hymn, id);
  assert.equal(restored.preferences[id].showChordSymbols, false);
  assert.deepEqual(restored.preferences[id].stanzas, [4]);
  const legacy = restoreSongalongRecords({
    schema: 1,
    "current:hymn": retired,
    [`hymn:${retired}:bpm`]: 92,
    [`favorites:${retired}`]: true,
  }).activities.sight as any;
  assert.equal(legacy.hymn, id);
  assert.equal(legacy.preferences[id].bpm, 92);
  assert.equal(legacy.favorites[id], true);
});

test("catalogue UUIDs are permanent identities, separate from public slugs and edition ownership", async () => {
  const { createHymnIdentityIndex } = await import("../../../packages/music-practice/src/hymn-identifiers");
  const { hymnSlug } = await import("../../../packages/music-practice/src/hymn-identity");
  const { instrumentEdition } = await import("../../../packages/music-practice/src/instrument-editions");
  assert.equal(new Set(hymns.map(h => h.id)).size, hymns.length);
  for (const song of hymns) {
    assert.match(song.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(song.id, song.slug);
    assert.equal(canonicalHymnId(song.slug), song.id);
    assert.equal(canonicalHymnId(song.id), song.id);
    assert.equal(hymnSlug(song.id), song.slug);
  }
  const original = hymns.find(h => h.id === id)!;
  const renamed = {...original, slug: "renamed-song"};
  const index = createHymnIdentityIndex([renamed]);
  assert.equal(index.id(slug), id);
  assert.equal(index.slug(slug), "renamed-song");
  assert.equal(index.edition("in-christ-alone").id, instrumentEdition(original)!.id);
  assert.equal(index.id("unrecognized-song"), "unrecognized-song");
  assert.throws(() => createHymnIdentityIndex([{...original,id:"not-a-uuid"}]), /Invalid song UUID/);
  assert.throws(() => createHymnIdentityIndex([original,original]), /Duplicate song UUID/);
  const other = hymns.find(h => h.id !== id)!;
  assert.throws(() => createHymnIdentityIndex([original,{...other,slug}]), /Conflicting song reference/);
});

test("all legacy song references migrate while canonical UUID values and checkpoint content win", () => {
  for (const song of hymns) for (const reversed of [false,true]) {
    const pairs = [[song.slug, {hymn:song.slug,bpm:72}], [song.id,{hymn:song.id,bpm:96}]] as const;
    const preferences = Object.fromEntries(reversed ? [...pairs].reverse() : pairs);
    const result = migrateHymnIdentity({
      catalogueRevision:1,hymn:song.slug,position:7,preferences,
      favorites:{[song.slug]:true},
      bookmarks:{[song.slug+":original:0:0"]:{content:"same-score",position:7,paused:true}},
      sections:{[song.slug+":original:0"]:3},
    });
    assert.equal(result.hymn,song.id);
    assert.equal(result.position,7);
    assert.deepEqual(result.preferences[song.id],{hymn:song.id,bpm:96});
    assert.equal(result.preferences[song.slug],undefined);
    assert.equal(result.favorites[song.id],true);
    assert.deepEqual(result.bookmarks[song.id+":original:0:0"],{content:"same-score",position:7,paused:true});
    assert.equal(result.sections[song.id+":original:0"],3);
    assert.deepEqual(migrateHymnIdentity(result),result);
  }
});

test("account saves retain the catalogue revision and do not remap teacher verses on every restore", () => {
  const legacy = {
    schema:1,"current:catalogueRevision":1,"current:hymn":slug,
    [`hymn:${slug}:stanzas`]:[2,4],
    [`favorites:${slug}`]:true,
  };
  const restored = restoreSongalongRecords(legacy);
  const records = songalongRecords(restored);
  assert.equal(records["current:catalogueRevision"],2);
  assert.equal(records["current:hymn"],id);
  assert.deepEqual(records[`hymn:${id}:stanzas`],[2,4]);
  assert.deepEqual(songalongRecords(restoreSongalongRecords(records)),records);
});

test("live account updates recognize legacy references to the active UUID", async () => {
  const { songalongLiveKeys } = await import("../../../packages/music-practice/src/songalong-account-records");
  const active = hymns[0], other = hymns[1];
  assert.deepEqual(songalongLiveKeys([
    `hymn:${active.slug}:bpm`,`bookmarks:${active.id}:original:0`,
    `sections:${active.slug}:original:0`,`hymn:${other.slug}:bpm`,
    `favorites:${active.slug}`,"activity:audio",
  ],active.id),[`hymn:${other.slug}:bpm`,`favorites:${active.slug}`,"activity:audio"]);
});

test("a legacy checkpoint resumes under the UUID and survives an account roundtrip", async () => {
  const { stagedHymn } = await import("../../../packages/music-practice/test-fixtures/hymns");
  const { HymnProgress, hymnProgressKey } = await import("../../../packages/music-practice/src/hymn-progress");
  const settings = {...hymnPreferences(stagedHymn.id),position:3};
  const key = hymnProgressKey(settings,stagedHymn.key);
  const oldKey = stagedHymn.slug + key.slice(stagedHymn.id.length);
  const raw: any = {
    version:1,catalogueRevision:1,hymn:stagedHymn.slug,
    preferences:{[stagedHymn.slug]:{...settings,hymn:stagedHymn.slug}},
    favorites:{[stagedHymn.slug]:true},sections:{},
    bookmarks:{[oldKey]:{version:1,content:"matching-score",position:3,paused:true,length:20}},
  };
  const progress = new HymnProgress(raw,[stagedHymn.id]);
  assert.deepEqual(progress.restore(settings,stagedHymn.key,"matching-score",20),{position:3,paused:true});
  assert.deepEqual(progress.restore(settings,stagedHymn.key,"changed-score",20),{position:0,paused:false});
  const state = migrateLegacy({});
  state.activities.sight = progress.snapshot(settings,stagedHymn.key,1);
  const roundtrip = restoreSongalongRecords(songalongRecords(state)).activities.sight as any;
  const loaded = new HymnProgress(roundtrip,[stagedHymn.id]);
  assert.deepEqual(loaded.restore(settings,stagedHymn.key,"matching-score",20),{position:3,paused:true});
  assert.equal(loaded.favorites[stagedHymn.id],true);
  assert.equal(raw.hymn,stagedHymn.slug);
});
