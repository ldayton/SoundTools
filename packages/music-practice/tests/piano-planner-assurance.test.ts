import test from "node:test";
import assert from "node:assert/strict";
import { planPianoFingering, type FingerNote } from "../src/piano-fingering";
import {
  exhaustivePianoCost,
  scorePianoReference,
} from "../test-fixtures/piano-fingering-oracle";
for (let seed = 1; seed <= 64; seed++)
  test(`piano exhaustive short phrase seed ${seed}`, () => {
    const hand = seed % 2 ? "right" : "left",
      first = 48 + ((seed * 17) % 24),
      second = first + ((seed * 11) % 13) - 6;
    const notes: FingerNote[] = [
      { midi: first, duration: seed % 4 ? 0.25 : 0.5 },
      {
        midi: second,
        duration: 0.25,
        restBefore: seed % 7 === 0,
        ...(seed % 3 === 0 ? { finger: 1 + (seed % 5) } : {}),
      },
      {
        midi: seed % 5 === 0 ? second : first + ((seed * 7) % 17) - 8,
        duration: 0.25,
        tied: seed % 5 === 0,
      },
    ];
    const original = structuredClone(notes);
    for (const n of notes) Object.freeze(n);
    Object.freeze(notes);
    const oracle = exhaustivePianoCost(notes, hand);
    assert.ok(oracle.cost !== null);
    const result = planPianoFingering(notes, hand),
      actual = scorePianoReference(notes, result, hand);
    assert.ok(
      Math.abs(actual - oracle.cost) < 1e-8,
      `seed ${seed}: ${actual} != ${oracle.cost}`,
    );
    assert.deepEqual(planPianoFingering(notes, hand), result);
    assert.deepEqual(notes, original);
  });
test("independent oracle explores all five assignments for a single white key", () => {
  const oracle = exhaustivePianoCost([{ midi: 60, duration: 0.25 }], "right");
  assert.equal(oracle.paths, 5);
  assert.equal(oracle.cost, 0);
});
