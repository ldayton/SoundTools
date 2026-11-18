import assert from "node:assert/strict";
import test from "node:test";
import { metronomeSettings, metronomeFrequency } from "../src/metronome-model";

test("unaccented clicks ignore both meter and backing bar position", () => {
  for (const linked of [false, true])
    for (const numerator of [1, 3, 5, 6, 7, 16])
      assert.deepEqual(
        Array.from({ length: 32 }, (_, i) =>
          metronomeFrequency(i, false, numerator, linked),
        ),
        Array(32).fill(1000),
      );
});
test("independent accents follow chosen meter; synced accents follow the band", () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, i) => metronomeFrequency(i, true, 3, false)),
    [1500, 1000, 1000, 1500, 1000, 1000, 1500],
  );
  assert.deepEqual(
    Array.from({ length: 9 }, (_, i) => metronomeFrequency(i, true, 7, true)),
    [1500, 1000, 1000, 1000, 1500, 1000, 1000, 1000, 1500],
  );
  assert.deepEqual(
    metronomeSettings({ tempo: NaN, numerator: NaN, denominator: 3 }),
    { tempo: 90, downbeat: false, numerator: 4, denominator: 4 },
  );
  assert.deepEqual(
    metronomeSettings({
      tempo: 112,
      downbeat: true,
      numerator: 6,
      denominator: 8,
    }),
    { tempo: 112, downbeat: true, numerator: 6, denominator: 8 },
  );
});
