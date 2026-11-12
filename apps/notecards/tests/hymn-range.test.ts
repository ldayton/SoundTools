import { test } from "node:test";
import assert from "node:assert/strict";
import hymns from "../src/hymns.json";
import { arrangeHymn } from "../src/hymn-arrangements";
import { hymnPitchRange, hymnRangeKeys } from "../src/hymn-range";
import { mergeHymnSettings, hymnSettingsFromQuery } from "../src/hymn-settings";
const hymn = hymns.find((h) => h.id === "amazing-grace")!;
const range = { low: 62, high: 74 };
test("hymn limits use actual pitches across the complete chosen part", () => {
  assert.deepEqual(
    hymnPitchRange(arrangeHymn(hymn, "melody", 0, 0).abc),
    range,
  );
  const bass = hymnPitchRange(arrangeHymn(hymn, "bass", 0, 0, "left").abc);
  const both = hymnPitchRange(arrangeHymn(hymn, "bass", 0, 0, "both").abc);
  assert.ok(bass.high < range.high);
  assert.equal(both.low, bass.low);
  assert.equal(both.high, range.high);
});
test("optional bounds are inclusive; Original wins, otherwise choose the lowest sounding key", () => {
  assert.equal(hymnRangeKeys("G", undefined, null, null).preferred, "original");
  assert.equal(hymnRangeKeys("G", range, 60, 74).preferred, "original");
  assert.equal(hymnRangeKeys("G", range, null, 73).preferred, "D");
  assert.equal(hymnRangeKeys("G", range, 64, null).preferred, "A");
  const one = hymnRangeKeys("G", range, 60, 72);
  assert.equal(one.preferred, "F");
  assert.deepEqual(
    one.choices.filter((c) => c.fits).map((c) => c.key),
    ["F"],
  );
  for (const [low, high] of [
    [60, 60],
    [75, 60],
    [90, null],
    [null, 40],
  ] as const) {
    const result = hymnRangeKeys("G", range, low, high);
    assert.equal(result.preferred, undefined);
    assert.ok(result.choices.every((c) => !c.fits));
  }
});
test("range settings remember optional notes, reject damaged limits and can clear either side", () => {
  const base = {
    hymn: hymn.id,
    arrangement: "melody" as const,
    sectionBars: 4 as const,
    section: 0,
    position: 0,
    low: 60,
    high: 74,
  };
  assert.equal(mergeHymnSettings(base, { low: 999 }).low, 60);
  assert.equal(mergeHymnSettings(base, { high: 60.1 }).high, 74);
  assert.equal(mergeHymnSettings(base, { low: null }).low, null);
  const query = hymnSettingsFromQuery(
    base,
    new URLSearchParams("low=none&high=72"),
  );
  assert.equal(query.low, null);
  assert.equal(query.high, 72);
});
