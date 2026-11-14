import { test } from "node:test";
import assert from "node:assert/strict";
import { visiblePianoLayout } from "../src/piano-layout";
import { acceptsPiano } from "../src/piano-model";
test("desktop adds keys at a fixed width, bounded by C2–B6", () => {
  const a = visiblePianoLayout(720, 60, 83, false, false),
    b = visiblePianoLayout(1440, 60, 83, false, false);
  assert.equal(a.whiteWidth, 32);
  assert.equal(b.whiteWidth, 32);
  assert.ok(b.high - b.low > a.high - a.low);
  assert.deepEqual([b.low, b.high], [36, 95]);
  assert.equal(b.rows.length, 1);
  assert.ok(b.whiteCount * 32 <= 1440);
});
test("phone keeps two compact octave rows with usable targets and deterministic range", () => {
  const a = visiblePianoLayout(304, 60, 83, false, true);
  assert.equal(a.whiteWidth, 32);
  assert.deepEqual(a.rows, [
    [60, 71],
    [72, 83],
  ]);
  assert.deepEqual(a, visiblePianoLayout(304, 60, 83, false, true));
  for (let low = 36; low <= 95; low++) {
    const p = visiblePianoLayout(304, low, low, false, true);
    assert.ok(p.low >= 36 && p.high <= 95);
    assert.equal(p.rows.length, 2);
  }
});
test("visible membership and musical grading are independent", () => {
  const card = {
    id: "C2:0",
    letter: "C" as const,
    octave: 2,
    modifier: 0 as const,
  };
  const small = visiblePianoLayout(304, 60, 83, false, true),
    wide = visiblePianoLayout(1440, 60, 83, false, false);
  assert.ok(36 < small.low);
  assert.ok(36 >= wide.low && 36 <= wide.high);
  assert.ok(acceptsPiano(card, 36));
  assert.ok(!acceptsPiano(card, 60));
});
