import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  practiceHymn,
  otherPracticeHymn,
  playbackHymn,
  playbackMelody,
  playbackBass,
  passageHymn,
  recoveryHymn,
  recoveryMelody,
  recoveryBass,
  pianoTieFixture,
  playbackAttacks,
  selectPracticeHymn,
} from "../test-fixtures/hymns";
import { hymnPitchRange } from "../src/hymn-range";
import { hymnArrangements } from "../src/hymn-arrangements";
import { instrumentEditionIds, instrumentEdition } from "../src/instrument-editions";
test("generic fixtures use supported piano and vocal scores without resurrecting retired stages",()=>{
  for(const hymn of [practiceHymn,otherPracticeHymn,playbackHymn,passageHymn,recoveryHymn]){
    const ids=hymnArrangements(hymn).map(a=>a.id);
    assert(ids.includes("piano"));assert(ids.includes("original"));
    assert(!ids.some(id=>["melody","bass","chords","broken"].includes(id)));
  }
  assert.notEqual(practiceHymn.id,otherPracticeHymn.id);
  assert.deepEqual(hymnPitchRange(playbackHymn.melody),{low:62,high:74});
  assert.notEqual(playbackMelody,playbackBass);
});
test("a song without supported instrument scores is skipped without changing its music",()=>{
  const unsupported={...practiceHymn,id:"unregistered"};
  assert.equal(selectPracticeHymn([unsupported,otherPracticeHymn]).id,otherPracticeHymn.id);
});
test("incompatible music fails before a browser starts with the migration instructions", () => {
  assert.throws(
    () => selectPracticeHymn([], { playback: true }),
    /docs\/testing.md/,
  );
  assert.throws(
    () =>
      selectPracticeHymn(
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
    selectPracticeHymn([passageHymn], { playback: true, passage: true }).id,
    passageHymn.id,
  );
  assert.equal(
    selectPracticeHymn([recoveryHymn], { recovery: true }).id,
    recoveryHymn.id,
  );
  assert.equal(new Set(recoveryMelody.slice(0, 3)).size, 3);
  assert.notEqual(recoveryBass, recoveryMelody[0]);
  assert(
    playbackAttacks("original")[0].length >= 3,
    "partial chord tests require several simultaneous notes",
  );
  assert(
    pianoTieFixture.index > 0,
    "tie-repetition checks require a written continuation after the first attack",
  );
});
