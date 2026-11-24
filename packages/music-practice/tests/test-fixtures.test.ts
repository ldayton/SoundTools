import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  stagedHymn,
  otherStagedHymn,
  playbackHymn,
  playbackMelody,
  playbackBass,
  passageHymn,
  recoveryHymn,
  recoveryMelody,
  recoveryBass,
  recoveryTieIndex,
  playbackAttacks,
  selectStagedHymn,
} from "../test-fixtures/hymns";
import { hymnPitchRange } from "../src/hymn-range";
import { hymnArrangements } from "../src/hymn-arrangements";
import { instrumentEditionIds, instrumentEdition } from "../src/instrument-editions";
test("generic fixtures expose staged controls rather than relying on a popular song name", () => {
  for (const hymn of [
    stagedHymn,
    otherStagedHymn,
    playbackHymn,
    passageHymn,
    recoveryHymn,
  ])
    assert.deepEqual(
      hymnArrangements(hymn)
        .filter(a=>["melody","bass","chords","broken","original"].includes(a.id)).map((a) => a.id).sort(),
      ["melody", "bass", "chords", "broken", "original"].sort(),
    );
  assert.notEqual(stagedHymn.id, otherStagedHymn.id);
  assert.notEqual(playbackMelody, playbackBass);
  assert.deepEqual(hymnPitchRange(playbackHymn.melody),{low:62,high:74});
  assert.match(playbackHymn.melody,/^M:(?:2|4)\/4\s*$/m);
});
test("a song promoted to a dedicated edition is skipped without changing generic assertions", () => {
  const migrated = { ...stagedHymn, id: "amazing-grace" };
  assert.equal(
    selectStagedHymn([migrated, otherStagedHymn]).id,
    otherStagedHymn.id,
  );
});
test("incompatible music fails before a browser starts with the migration instructions", () => {
  assert.throws(
    () => selectStagedHymn([], { playback: true }),
    /docs\/testing.md/,
  );
  assert.throws(
    () =>
      selectStagedHymn(
        [
          {
            ...playbackHymn,
            melody: playbackHymn.melody.replace(/^M:.*$/m, "M:none"),
          },
        ],
        { playback: true },
      ),
    /metered/,
  );
});
test("every registered edition owns unit and automatically enrolled browser coverage", () => {
  for (const id of instrumentEditionIds) {
    const key = instrumentEdition({id})!.editionKey;
    const stem = key === "the-1st-fingerstyle-blues" ? "fingerstyle" : key;
    for (const extension of ["test.ts", "browser.ts"])
      assert(
        existsSync(
          new URL(
            `../../../apps/songalong/tests/${stem}-editions.${extension}`,
            import.meta.url,
          ),
        ),
        `${id}: add ${stem}-editions.${extension}; see docs/testing.md`,
      );
  }
});

test("passage and recovery fixtures retain the rhythm and held-note contracts of their browser scenarios", () => {
  assert.equal(
    selectStagedHymn([passageHymn], { playback: true, passage: true }).id,
    passageHymn.id,
  );
  assert.equal(
    selectStagedHymn([recoveryHymn], { recovery: true }).id,
    recoveryHymn.id,
  );
  assert.equal(new Set(recoveryMelody.slice(0, 3)).size, 3);
  assert.notEqual(recoveryBass, recoveryMelody[0]);
  assert(
    playbackAttacks("original")[0].length >= 3,
    "partial chord tests require several simultaneous notes",
  );
  assert(
    recoveryTieIndex > 0,
    "tie-repetition checks require a written continuation after the first attack",
  );
});
