import test from "node:test";
import assert from "node:assert/strict";
import corpus from "../test-fixtures/external/piano-fingering-kanma/cases.json";
import { planPianoFingering, type FingerNote } from "../src/piano-fingering";
for (const c of corpus.cases) {
  const polyphonic = c.expected.some((e) => e.notes.length > 1);
  if (polyphonic) {
    test(`upstream ${c.id}: retain chord reference data without flattening it`, () => {
      assert.ok(c.expected.every((e) => e.notes.length === e.fingers.length));
      for (const e of c.expected) {
        assert.equal(new Set(e.fingers).size, e.notes.length);
        assert.ok(e.fingers.every((f) => f >= 1 && f <= 5));
      }
      // The current production API is explicitly single-note; accepting a chord
      // as a MIDI number would fabricate a result. Whole-hand planning is separate.
      assert.throws(() =>
        planPianoFingering(
          [{ midi: c.expected[0].notes as any, duration: 0.25 }],
          c.hand as "right" | "left",
        ),
      );
    });
    continue;
  }
  test(`upstream ${c.id}: selected fingers match the licensed reference`, () => {
    let rest = false;
    const notes: FingerNote[] = [];
    for (const item of c.input) {
      if (Array.isArray(item) && !item.length) {
        rest = true;
        continue;
      }
      const fixed =
        typeof item === "object" && !Array.isArray(item) ? item : undefined;
      notes.push({
        midi: typeof item === "number" ? item : fixed!.notes[0],
        duration: 0.25,
        restBefore: rest,
        ...(fixed ? { finger: fixed.fingers[0] } : {}),
      });
      rest = false;
    }
    const expected = c.expected
      .filter((e) => e.notes.length)
      .flatMap((e) => e.fingers);
    const result = planPianoFingering(notes, c.hand as "right" | "left");
    assert.deepEqual(
      result.map((n) => n.finger),
      expected,
    );
  });
}

import anchor from "../test-fixtures/external/pianoplayer/anchor.json";
test("PianoPlayer existing-anchor regression retains the specified finger", () => {
  const result = planPianoFingering(anchor.notes, "right");
  assert.equal(result.length, 12);
  assert.equal(result[1].finger, 5);
});
