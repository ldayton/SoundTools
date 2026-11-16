import assert from 'node:assert/strict';
import { test } from 'node:test';
import { referenceRows } from '../src/keyboard-layout';
test('reference keybed covers every pitch exactly once, with no partial black keys at row seams', () => {
  for (const width of [224, 256, 320, 640, 1000])
    for (let low = 24; low < 77; low++) {
      const high = low + 19,
        rows = referenceRows(low, high, width);
      const pitches = rows.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
      assert.equal(new Set(pitches).size, pitches.length);
      for (let midi = low; midi <= high; midi++) assert.ok(pitches.includes(midi));
      for (const [a, b] of rows) {
        const black = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);
        assert.equal(black(a), false);
        assert.equal(black(b), false);
        assert.ok(pitches.filter((n) => n >= a && n <= b && !black(n)).length * 32 <= width);
      }
    }
});
