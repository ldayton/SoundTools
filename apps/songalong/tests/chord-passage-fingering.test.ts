import test from "node:test";
import assert from "node:assert/strict";
import {
  passageFingerings,
  fingeringWindow,
  type FingeringNote,
} from "../../../packages/music-practice/src/chord-passage-fingering";
const bass: FingeringNote = {
  start: 0,
  duration: 3,
  positions: [
    { str: 5, num: 3 },
    { str: 4, num: 2 },
  ],
};
test("combines written melody and held bass rather than filling out a generic G shape", () => {
  const shapes = passageFingerings(
    [
      bass,
      { start: 0, duration: 1, positions: [{ str: 3, num: 0 }] },
      { start: 1, duration: 2, positions: [{ str: 2, num: 0 }] },
    ],
    0,
    3,
  );
  assert.deepEqual(shapes, [
    [3, 2, 0, null, null, null],
    [3, 2, null, 0, null, null],
  ]);
});
test("starts a selected passage in the middle of a sustain and stops at the next chord", () => {
  assert.deepEqual(
    passageFingerings(
      [
        bass,
        { start: 1, duration: 1, positions: [{ str: 1, num: 3 }] },
        { start: 2, duration: 1, positions: [{ str: 0, num: 3 }] },
      ],
      1,
      2,
    ),
    [[3, 2, null, null, 3, null]],
  );
});
test("keeps melody positions separate when they use different frets on the same string", () => {
  assert.deepEqual(
    passageFingerings(
      [
        { start: 0, duration: 1, positions: [{ str: 0, num: 5 }] },
        { start: 1, duration: 1, positions: [{ str: 0, num: 7 }] },
      ],
      0,
      2,
    ),
    [
      [null, null, null, null, null, 5],
      [null, null, null, null, null, 7],
    ],
  );
});
test("does not add frames for repeated/tied notes with the same string positions", () => {
  assert.deepEqual(
    passageFingerings(
      [
        { start: 0, duration: 1, positions: [{ str: 0, num: 0 }] },
        { start: 1, duration: 1, positions: [{ str: 0, num: 0 }] },
      ],
      0,
      2,
    ),
    [[null, null, null, null, null, 0]],
  );
});
test("removes released notes while retaining a longer bass and allows a rest frame", () => {
  assert.deepEqual(
    passageFingerings(
      [
        { start: 0, duration: 2, positions: [{ str: 5, num: 0 }] },
        { start: 0, duration: 1, positions: [{ str: 0, num: 0 }] },
      ],
      0,
      3,
    ),
    [
      [0, null, null, null, null, 0],
      [0, null, null, null, null, null],
      [null, null, null, null, null, null],
    ],
  );
});
test("does not substitute a stock shape for unknown or conflicting string positions", () => {
  assert.deepEqual(
    passageFingerings(
      [bass, { start: 0, duration: 1, positions: undefined }],
      0,
      1,
    ),
    [],
  );
  assert.deepEqual(
    passageFingerings(
      [bass, { start: 0, duration: 1, positions: [{ str: 5, num: 5 }] }],
      0,
      1,
    ),
    [],
  );
  for (const position of [
    { str: 6, num: 0 },
    { str: 1, num: NaN },
    { str: 1, num: 25 },
    { str: 1, num: -1 },
  ])
    assert.deepEqual(
      passageFingerings(
        [{ start: 0, duration: 1, positions: [position] }],
        0,
        1,
      ),
      [],
    );
});
test("keeps high-position and capo-relative frets exactly as supplied", () => {
  assert.deepEqual(
    passageFingerings(
      [
        {
          start: 0,
          duration: 1,
          positions: [
            { str: 5, num: 0 },
            { str: 0, num: 8 },
          ],
        },
      ],
      0,
      1,
    ),
    [[0, null, null, null, null, 8]],
  );
});
test("a silent passage has no fingering popup", () => {
  assert.deepEqual(
    passageFingerings([{ start: 0, duration: 1, positions: [] }], 0, 1),
    [],
  );
});

test("diagram covers high frets alongside open strings and has stable passage height", () => {
  const shapes = [
    [0, null, null, null, null, 8],
    [null, null, 3, null, null, 8],
  ];
  assert.deepEqual(fingeringWindow(shapes, 0), { base: 8, rows: 8 });
  assert.deepEqual(fingeringWindow(shapes, 1), { base: 1, rows: 8 });
});
