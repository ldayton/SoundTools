import test from "node:test";
import assert from "node:assert/strict";
import {
  HILA_SHAPES,
  hilaPositions,
  hilaShift,
} from "../src/hila-scale-shapes";
import {
  guitarScaleFromQuery,
  mergeGuitarScaleSettings,
} from "../src/guitar-scale-settings";

// Hila's WhatsApp diagrams, high E through low E, ordered by lowest fret.
const diagrams = [
  [
    [1, 3, 5],
    [3, 5],
    [2, 4, 5],
    [2, 3, 5],
    [2, 3, 5],
    [1, 3, 5],
  ],
  [
    [3, 5, 7],
    [5, 6],
    [4, 5, 7],
    [3, 5, 7],
    [3, 5, 7],
    [3, 5, 7],
  ],
  [
    [5, 7, 8],
    [5, 6, 8],
    [5, 7],
    [5, 7, 9],
    [5, 7, 8],
    [5, 7, 8],
  ],
  [
    [7, 8, 10],
    [8, 10],
    [7, 9, 10],
    [7, 9, 10],
    [7, 8, 10],
    [7, 8, 10],
  ],
  [
    [8, 10, 12],
    [10, 12],
    [9, 10, 12],
    [9, 10, 12],
    [8, 10, 12],
    [8, 10, 12],
  ],
  [
    [10, 12, 13],
    [10, 12, 13],
    [10, 12],
    [10, 12, 14],
    [10, 12, 14],
    [10, 12, 13],
  ],
  [
    [12, 13, 15],
    [12, 13, 15],
    [12, 14],
    [12, 14, 15],
    [12, 14, 15],
    [12, 13, 15],
  ],
];
test("all seven C-major shapes match Hila’s supplied diagrams exactly", () => {
  for (const shape of HILA_SHAPES) {
    const notes = hilaPositions(0, shape, 0);
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((string) =>
        notes.filter((n) => n.string === string).map((n) => n.fret),
      ),
      diagrams[shape - 1],
    );
  }
});
test("every transposed shape is 17 consecutive scale notes within the AP66 fretboard", () => {
  for (let tonic = 0; tonic < 12; tonic++)
    for (const shape of HILA_SHAPES) {
      const shift = hilaShift(tonic, shape);
      const notes = hilaPositions(tonic, shape, shift);
      assert.equal(notes.length, 17);
      assert.equal(new Set(notes.map((n) => n.midi)).size, 17);
      assert.ok(notes.every((n) => n.fret >= 1 && n.fret <= 18));
      const pitches = [0, 2, 4, 5, 7, 9, 11].map((n) => (n + tonic) % 12);
      const expected = [];
      for (let midi = notes[0].midi; midi <= notes.at(-1)!.midi; midi++)
        if (pitches.includes(midi % 12)) expected.push(midi);
      assert.deepEqual(
        notes.map((n) => n.midi),
        expected,
      );
    }
  assert.throws(() => hilaPositions(0, 7, 12));
});
test("Hila settings and bookmarks remain separate from the existing shape selection", () => {
  const base = { tonic: 0, quality: "major" as const, pattern: "4" as const };
  const saved = guitarScaleFromQuery(
    new URLSearchParams("set=hila&shape=7"),
    base,
  );
  assert.equal(saved.shapeSet, "hila");
  assert.equal(saved.hilaShape, 7);
  assert.equal(saved.pattern, "4");
  assert.equal(
    mergeGuitarScaleSettings({ quality: "minor" }, saved).shapeSet,
    "standard",
  );
  assert.equal(mergeGuitarScaleSettings({ hilaShape: 99 }, saved).hilaShape, 7);
  assert.equal(
    mergeGuitarScaleSettings({ shapeSet: "standard" }, saved).pattern,
    "4",
  );
});
