import test from "node:test";
import assert from "node:assert/strict";
import fixtures from "../test-fixtures/external/chords-db/reviewed-guitar-positions.json";
import {
  assessGuitarFingering,
  findGuitarFingering,
} from "../src/guitar-chord-fingering";
import {
  guitarHandCandidates,
  planGuitarPhrase,
  scoreGuitarHand,
} from "../src/guitar-phrase-fingering";
const tuning = [40, 45, 50, 55, 59, 64];

for (const fixture of fixtures.positions)
  test(`external ${fixture.id}: reviewed fingering remains an available complete plan`, () => {
    const { position: p } = fixture;
    // Upstream diagram frets are relative to baseFret; open strings stay open.
    const frets = p.frets.map((f) =>
      f < 0 ? null : f === 0 ? 0 : f + p.baseFret - 1,
    );
    const fingers = p.fingers.map((f, i) => (frets[i] === null ? null : f));
    const unplayedStrings = frets.flatMap((f, i) =>
      f === null ? [6 - i] : [],
    );
    const limits = { maxFingers: 4, allowBarres: true, unplayedStrings };
    assert.deepEqual(
      frets.flatMap((f, i) => (f === null ? [] : [tuning[i] + f])),
      p.midi,
      "independent absolute-pitch check catches base-fret/string-order mistakes",
    );
    assert.ok(
      assessGuitarFingering(frets, fingers, limits),
      "reviewed upstream finger assignment is feasible",
    );
    assert.ok(
      findGuitarFingering(frets, limits),
      "shared chord search respects the same unplayed-string policy",
    );
    assert.deepEqual(
      assessGuitarFingering(frets, fingers, limits)!
        .barres.map((b) => b.fret)
        .sort((a, b) => a - b),
      p.barres.map((f) => f + p.baseFret - 1).sort((a, b) => a - b),
      "barre metadata uses the same absolute fret convention",
    );
    const candidates = guitarHandCandidates(frets, limits);
    assert.ok(
      candidates.some((c) => c.fingers.every((f, i) => f === fingers[i])),
      "upstream is one acceptable answer; it need not be the only or lowest-cost answer",
    );
    const plan = planGuitarPhrase(
      frets.flatMap((f, i) =>
        f === null
          ? []
          : [{ id: String(i), start: 0, duration: 1, string: 6 - i, fret: f }],
      ),
    )!;
    assert.ok(plan);
    assert.equal(plan.notes.length, p.midi.length);
    assert.ok(
      Array.from({ length: 24 }, (_, i) =>
        scoreGuitarHand(frets, fingers, i + 1, {}, unplayedStrings),
      ).some(Boolean),
    );
    assert.deepEqual(
      plan.notes.map((n) => [n.string, n.fret]),
      frets.flatMap((f, i) => (f === null ? [] : [[6 - i, f]])),
      "planner preserves the external fixed tab",
    );
    assert.equal(
      new Set(candidates.map((c) => JSON.stringify(c.fingers))).size,
      candidates.length,
      "equivalent candidate assignments are not duplicated",
    );
  });

test("an unplayed gap can be barred, but sounding open/lower strings still block it", () => {
  const limits = { maxFingers: 1, allowBarres: true, unplayedStrings: [3] };
  const fingers = [null, null, 1, null, 1, null];
  assert.ok(
    assessGuitarFingering([null, null, 2, null, 2, null], fingers, limits),
  );
  assert.equal(
    assessGuitarFingering([null, null, 2, null, 2, null], fingers, {
      ...limits,
      unplayedStrings: [],
    }),
    null,
  );
  for (const blocking of [0, 1]) {
    const grip = [null, null, 2, blocking, 2, null],
      assigned = [null, null, 1, blocking === 0 ? 0 : 2, 1, null];
    assert.equal(
      assessGuitarFingering(grip, assigned, { ...limits, maxFingers: 4 }),
      null,
    );
    assert.equal(findGuitarFingering(grip, limits), null);
  }
  assert.equal(
    findGuitarFingering([null, null, 2, null, 2, null], {
      ...limits,
      unplayedStrings: [7],
    }),
    null,
  );
});

test("a later open-string attack prevents choosing a conflicting initial barre over held notes", () => {
  const held = [
    { id: "low", start: 0, duration: 2, string: 4, fret: 2 },
    { id: "high", start: 0, duration: 2, string: 2, fret: 2 },
  ];
  assert.equal(
    planGuitarPhrase(held, { maxFingers: 1 })!.states[0].barres.length,
    1,
  );
  const events = [
    ...held,
    { id: "open", start: 1, duration: 1, string: 3, fret: 0 },
  ];
  const plan = planGuitarPhrase(events)!;
  assert.ok(plan);
  for (const state of plan.states)
    assert.notEqual(state.fingers.low, state.fingers.high);
  assert.equal(plan.notes[2].finger, 0);
  assert.equal(planGuitarPhrase(events, { maxFingers: 1 }), null);
});
