import test from "node:test";
import assert from "node:assert/strict";
import { audiblePianoTime } from "../../../packages/music-practice/src/piano-clock";

test("visual clock follows speaker timestamps, with safe latency fallback", () => {
  assert.equal(
    audiblePianoTime(
      {
        currentTime: 10,
        getOutputTimestamp: () => ({ contextTime: 9.9, performanceTime: 1000 }),
      },
      1020,
    ),
    9.92,
  );
  assert.ok(
    Math.abs(
      audiblePianoTime(
        { currentTime: 10, baseLatency: 0.01, outputLatency: 0.04 },
        1000,
      ) - 9.95,
    ) < 1e-10,
  );
  assert.equal(
    audiblePianoTime(
      {
        currentTime: 0,
        getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }),
      },
      1000,
    ),
    0,
  );
  assert.equal(
    audiblePianoTime(
      {
        currentTime: 1,
        getOutputTimestamp: () => ({ contextTime: 2, performanceTime: 1000 }),
      },
      2000,
    ),
    1,
    "never advance past rendered audio",
  );
});

import { newPianoAttacks } from "../../../packages/music-practice/src/piano-attacks";
test("repeat animation follows new onsets, not tied continuations or unison releases", () => {
  const first = { pitch: 60, start: 0 },
    second = { pitch: 60, start: 1 },
    bass = { pitch: 48, start: 0 };
  assert.deepEqual(newPianoAttacks([], [first, bass]), [60, 48]);
  assert.deepEqual(newPianoAttacks([first, bass], [first, bass]), []);
  assert.deepEqual(newPianoAttacks([first, bass], [second, bass]), [60]);
  assert.deepEqual(newPianoAttacks([first, second], [second]), []);
  assert.deepEqual(newPianoAttacks([first], []), []);
});
