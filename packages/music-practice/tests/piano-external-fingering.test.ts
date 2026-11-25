import test from "node:test";
import assert from "node:assert/strict";
import corpus from "../test-fixtures/external/piano-fingering-kanma/cases.json";
import { planPianoFingering, type FingerNote } from "../src/piano-fingering";
import {
  planPianoPhrase,
  type PianoPhraseNote,
} from "../src/piano-phrase-fingering";
for (const c of corpus.cases) {
  const polyphonic = c.expected.some((e) => e.notes.length > 1);
  if (polyphonic) {
    test(`upstream ${c.id}: chord reference is a feasible whole-hand alternative`, () => {
      const notes: PianoPhraseNote[] = c.expected.flatMap((e, i) =>
        e.notes.map((midi, j) => ({
          id: `${i}:${j}`,
          hand: c.hand as "right" | "left",
          midi,
          start: i,
          duration: 1,
          finger: e.fingers[j],
        })),
      );
      const fixed = planPianoPhrase(notes);
      assert.equal(fixed.status, "complete");
      assert.deepEqual(
        fixed.notes.map((n) => n.finger),
        notes.map((n) => n.finger),
      );
      assert.equal(
        planPianoPhrase(notes.map(({ finger, ...n }) => n)).status,
        "complete",
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
