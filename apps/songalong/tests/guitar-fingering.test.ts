import test from "node:test";
import assert from "node:assert/strict";
import { planGuitarFingering } from "../../../packages/music-practice/src/guitar-fingering";
test("fixed-tab melody planner handles opens, repeated notes, shifts, and invalid inputs", () => {
  assert.deepEqual(planGuitarFingering([]), []);
  const notes = [2, 3, 2, 3, 2, 0, 2, 3, 2, 0, 12, 14].map((fret, i) => ({
    string: i === 1 || i === 3 ? 2 : 1,
    fret,
    duration: 0.25,
  }));
  const result = planGuitarFingering(notes);
  assert.equal(result[5].finger, 0);
  assert.ok(result.some((n) => n.shift));
  result.forEach((r, i) => {
    if (notes[i].fret) {
      assert.ok(r.finger >= 1 && r.finger <= 4);
      assert.ok(Math.abs(notes[i].fret - (r.position + r.finger - 1)) <= 1);
    }
  });
  const repeated = planGuitarFingering(
    Array.from({ length: 8 }, () => ({ string: 1, fret: 3, duration: 0.25 })),
  );
  assert.equal(new Set(repeated.map((n) => n.finger)).size, 1);
  assert.throws(() =>
    planGuitarFingering([{ string: 7, fret: 2, duration: 0.25 }]),
  );
  assert.throws(() =>
    planGuitarFingering([{ string: 1, fret: 2, duration: 0 }]),
  );
});
