import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { stagedHymn, otherStagedHymn, playbackHymn, playbackMelody, playbackBass, selectStagedHymn } from "../test-fixtures/hymns";
import { hymnArrangements } from "../src/hymn-arrangements";
import { instrumentEditionIds } from "../src/instrument-editions";
test("generic fixtures expose staged controls rather than relying on a popular song name", () => {
  for (const hymn of [stagedHymn, otherStagedHymn, playbackHymn])
    assert.deepEqual(hymnArrangements(hymn).map(a => a.id).slice(0, 5), ["melody", "bass", "chords", "broken", "original"]);
  assert.notEqual(stagedHymn.id, otherStagedHymn.id);
  assert.notEqual(playbackMelody, playbackBass);
});
test("a song promoted to a dedicated edition is skipped without changing generic assertions", () => {
  const migrated = { ...stagedHymn, id: "amazing-grace" };
  assert.equal(selectStagedHymn([migrated, otherStagedHymn]).id, otherStagedHymn.id);
});
test("incompatible music fails before a browser starts with the migration instructions", () => {
  assert.throws(() => selectStagedHymn([], { playback: true }), /docs\/testing.md/);
  assert.throws(() => selectStagedHymn([{ ...playbackHymn, melody: playbackHymn.melody.replace('M:4/4', 'M:none') }], { playback: true }), /metered/);
});
test("every registered edition owns unit and automatically enrolled browser coverage", () => {
  for (const id of instrumentEditionIds) {
    const stem = id === "the-1st-fingerstyle-blues" ? "fingerstyle" : id;
    for (const extension of ['test.ts', 'browser.ts'])
      assert(existsSync(new URL(`../../../apps/songalong/tests/${stem}-editions.${extension}`, import.meta.url)),
        `${id}: add ${stem}-editions.${extension}; see docs/testing.md`);
  }
});
