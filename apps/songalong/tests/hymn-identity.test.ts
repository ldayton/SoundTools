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
const id = "in-christ-alone",
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
      [id]: { hymn: id, stanzas: [3], bpm: 70 },
      [retired]: {
        hymn: retired,
        stanzas: [2, 4],
        bpm: 96,
        showChordSymbols: false,
      },
    },
    favorites: { [id]: false, [retired]: true },
    bookmarks: {
      [id + ":original"]: { content: "old" },
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
    hymn: id,
    stanzas: [1, 2, 3],
    stanza: 3,
    position: 40,
    section: 3,
    preferences: { [id]: { stanzas: [2, 3] } },
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
