import test from "node:test";
import assert from "node:assert/strict";
import {
  scalePositions,
  scaleNotes,
  SCALE_QUALITIES,
} from "../src/guitar-scales";
import {
  mergeGuitarScaleSettings,
  guitarScaleFromQuery,
} from "../src/guitar-scale-settings";
const tuning = [64, 59, 55, 50, 45, 40];
test("complete C major range includes the B-string root missing from the supplied crop", () => {
  const positions = scalePositions(0, "major", undefined, 1, 5);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((string) =>
      positions.filter((n) => n.string === string).map((n) => n.fret),
    ),
    [
      [1, 3, 5],
      [1, 3, 5],
      [2, 4, 5],
      [2, 3, 5],
      [2, 3, 5],
      [1, 3, 5],
    ],
  );
  assert.deepEqual(
    positions.filter((n) => n.root).map((n) => [n.string, n.fret]),
    [
      [5, 3],
      [3, 5],
      [2, 1],
    ],
  );
});
test("fret ranges are complete and exact for every key and scale family", () => {
  for (const quality of SCALE_QUALITIES)
    for (let tonic = 0; tonic < 12; tonic++)
      for (const [from, to] of [
        [0, 5],
        [1, 5],
        [7, 12],
        [12, 12],
        [0, 24],
      ]) {
        const notes = scaleNotes(tonic, quality);
        const expected = [];
        for (let string = 6; string >= 1; string--)
          for (let fret = from; fret <= to; fret++)
            if (
              notes.some(
                (n) => n.pitchClass === (tuning[string - 1] + fret) % 12,
              )
            )
              expected.push(`${string}:${fret}`);
        assert.deepEqual(
          scalePositions(tonic, quality, undefined, from, to).map(
            (n) => `${n.string}:${n.fret}`,
          ),
          expected,
        );
      }
  assert.throws(() => scalePositions(0, "major", undefined, 6, 2));
});
test("range bookmarks and invalid bounds normalize safely", () => {
  const s = guitarScaleFromQuery(
    new URLSearchParams("key=C&pattern=map&from=1&to=5&labels=none"),
    { tonic: 4, quality: "major" },
  );
  assert.equal(s.firstFret, 1);
  assert.equal(s.lastFret, 5);
  assert.equal(s.labels, "none");
  const next = mergeGuitarScaleSettings({ firstFret: 12, lastFret: 3 }, s);
  assert.equal(next.lastFret, 12);
  assert.equal(
    mergeGuitarScaleSettings({ firstFret: -1, lastFret: 99 }, s).lastFret,
    5,
  );
});
