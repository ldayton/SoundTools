import { test } from "node:test";
import assert from "node:assert/strict";
import hymns from "../../../packages/music-practice/src/hymns.json";
import abcjs from "abcjs";
import { HYMN_KEYS, hymnTransposition } from "../../../packages/music-practice/src/hymn-transpose";
import { ARRANGEMENTS, arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import {
  hymnPitchRange,
  hymnRangeKeys,
  hymnRangeLabel,
} from "../../../packages/music-practice/src/hymn-range";
import { mergeHymnSettings, hymnSettingsFromQuery } from "../../../packages/music-practice/src/hymn-settings";
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

test("range labels preserve the key spelling and correct octave", () => {
  assert.equal(hymnRangeLabel({ low: 62, high: 74 }, "G", "Eb"), "B♭3–B♭4");
  assert.equal(hymnRangeLabel({ low: 65, high: 77 }, "F#"), "E♯4–E♯5");
  assert.equal(hymnRangeLabel({ low: 60, high: 72 }, "C#"), "B♯3–B♯4");
  assert.equal(hymnRangeLabel({ low: 59, high: 71 }, "Cb"), "C♭4–C♭5");
});
test("all hymn ranges match the actual transposed staff and playback in every hand and key", () => {
  for (const hymn of hymns)
    for (const { id } of ARRANGEMENTS)
      for (const hands of ["right", "left", "both"] as const) {
        const abc = arrangeHymn(hymn, id, 0, 0, hands).abc;
        const source = hymnPitchRange(abc);
        for (const key of ["original", ...HYMN_KEYS] as const) {
          const { semitones } = hymnTransposition(hymn.key, key);
          const tune = abcjs.parseOnly(abc, { visualTranspose: semitones })[0];
          const audio = tune.setUpAudio({
            midiTranspose: semitones,
            chordsOff: true,
          });
          const pitches = audio.tracks.flatMap((track) =>
            track.flatMap((n) => (n.cmd === "note" ? [n.pitch] : [])),
          );
          const written = tune.lines
            .flatMap((l) => l.staff || [])
            .flatMap((s) => s.voices)
            .flat()
            .flatMap((n) =>
              n?.el_type === "note"
                ? (n.midiPitches || []).map((p: { pitch: number }) => p.pitch)
                : [],
            );
          const expected = [source.low + semitones, source.high + semitones];
          const context = `${hymn.id} ${id} ${hands} ${key}`;
          assert.deepEqual(
            [Math.min(...pitches), Math.max(...pitches)],
            expected,
            context + " audio",
          );
          assert.deepEqual(
            [Math.min(...written), Math.max(...written)],
            expected,
            context + " staff",
          );
        }
      }
});
