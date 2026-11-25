import test from "node:test";
import assert from "node:assert/strict";
import { planPianoFingering, type FingerNote } from "../src/piano-fingering";
const note = (midi = 60): FingerNote => ({ midi, duration: 0.25 });
test("invalid piano inputs fail before producing partial suggestions", () => {
  for (const midi of [-1, 128, 60.5, NaN, Infinity])
    assert.throws(() => planPianoFingering([note(midi)], "right"));
  for (const duration of [0, -1, NaN, Infinity])
    assert.throws(() => planPianoFingering([{ ...note(), duration }], "right"));
  for (const finger of [0, 6, 1.5, NaN])
    assert.throws(() => planPianoFingering([{ ...note(), finger }], "right"));
  assert.throws(() => planPianoFingering([], "sideways" as any));
  assert.throws(() => planPianoFingering([{ ...note(), tied: true }], "right"));
  assert.throws(() =>
    planPianoFingering([note(), { ...note(61), tied: true }], "right"),
  );
  assert.throws(() =>
    planPianoFingering(
      [note(), { ...note(), tied: true, restBefore: true }],
      "right",
    ),
  );
});
test("explicit fingers constrain the entire search, including ties", () => {
  for (const hand of ["right", "left"] as const) {
    const result = planPianoFingering(
      [
        { ...note(), finger: 4 },
        { ...note(), tied: true },
      ],
      hand,
    );
    assert.equal(result[0].finger, 4);
    assert.equal(result[1].finger, 4);
    assert.equal(result[1].anchor, result[0].anchor);
    assert.throws(() =>
      planPianoFingering(
        [
          { ...note(), finger: 1 },
          { ...note(), tied: true, finger: 5 },
        ],
        hand,
      ),
    );
  }
});
