import { test } from "node:test";
import assert from "node:assert/strict";
import { ORGAN_DRAWBARS, tonewheelPartials } from "../src/backing-organ";

test("tonewheel registrations follow Hammond footage and upper foldback", () => {
  assert.deepEqual([...ORGAN_DRAWBARS], [1, 3, 2, 4, 6, 8, 10, 12, 16]);
  for (let note = 48; note <= 84; note++) {
    const warm = tonewheelPartials(note, "warm"),
      full = tonewheelPartials(note, "full");
    assert.ok(Math.abs(warm.base * 2 - 440 * 2 ** ((note - 69) / 12)) < 1e-8);
    for (let i = 0; i < full.imaginary.length; i++) {
      assert.ok(Number.isFinite(full.imaginary[i]));
      if (full.imaginary[i]) assert.ok(full.base * i <= 5920);
    }
    assert.ok(
      full.imaginary.reduce((a, n) => a + n, 0) >
        warm.imaginary.reduce((a, n) => a + n, 0),
    );
    assert.equal(warm.real[0], 0);
    assert.equal(full.imaginary[0], 0, "no DC component");
  }
});
