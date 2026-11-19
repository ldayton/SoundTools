import test from "node:test";
import assert from "node:assert/strict";
import { planPianoFingering, pianoKeyPosition } from "../src/piano-fingering";
const notes = (pitches: number[]) =>
  pitches.map((midi) => ({ midi, duration: 0.25 }));
test("five-finger phrases stay still, mirrored between hands", () => {
  assert.deepEqual(
    planPianoFingering(notes([60, 62, 64, 65, 67]), "right").map(
      (n) => n.finger,
    ),
    [1, 2, 3, 4, 5],
  );
  const left = planPianoFingering(notes([48, 50, 52, 53, 55]), "left");
  assert.deepEqual(
    left.map((n) => n.finger),
    [5, 4, 3, 2, 1],
  );
  assert.ok(left.every((n) => !n.shift));
});
test("looks ahead to conventional scale crossings and distinguishes leaps", () => {
  const right = planPianoFingering(
    notes([60, 62, 64, 65, 67, 69, 71, 72]),
    "right",
  );
  assert.deepEqual(
    right.map((n) => n.finger),
    [1, 2, 3, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    right.flatMap((n, i) => (n.shift ? [i] : [])),
    [3],
  );
  assert.ok(right[3].crossing);
  assert.deepEqual(
    planPianoFingering(notes([48, 50, 52, 53, 55, 57, 59, 60]), "left").map(
      (n) => n.finger,
    ),
    [5, 4, 3, 2, 1, 3, 2, 1],
  );
  const leap = planPianoFingering(notes([60, 62, 64, 72, 74, 76]), "right");
  assert.ok(leap[3].shift);
  assert.equal(leap[3].crossing, false);
});
test("ties retain the same finger and position, including around leaps", () => {
  const input = notes([60, 60, 62, 64, 72]);
  input[1] = { ...input[1], tied: true } as any;
  const result = planPianoFingering(input, "right");
  assert.equal(result[0].finger, result[1].finger);
  assert.equal(result[0].anchor, result[1].anchor);
  assert.equal(result[1].shift, false);
});
test("all transpositions remain in the conservative reach model and deterministic", () => {
  for (const hand of ["right", "left"] as const)
    for (let shift = -12; shift <= 12; shift++) {
      const input = notes(
        [60, 62, 63, 64, 67, 69, 72, 69, 67, 64, 63, 62, 60].map(
          (n) => n + shift,
        ),
      );
      const result = planPianoFingering(input, hand),
        sign = hand === "right" ? 1 : -1;
      assert.deepEqual(planPianoFingering(input, hand), result);
      result.forEach((n, i) => {
        assert.ok(n.finger >= 1 && n.finger <= 5);
        assert.ok(
          Math.abs(
            pianoKeyPosition(input[i].midi) -
              (n.anchor + sign * (n.finger - 1)),
          ) <= 0.61,
        );
        if (i && !n.shift) assert.equal(n.anchor, result[i - 1].anchor);
      });
    }
});
