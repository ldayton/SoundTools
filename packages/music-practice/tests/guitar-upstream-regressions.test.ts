// SPDX-License-Identifier: GPL-3.0-only
// Cases adapted from Noah Baculi's guitar-tab-generator. Source, revision and
// full license: ../test-fixtures/external/guitar-tab-generator/.
import test from "node:test";
import assert from "node:assert/strict";
import corpus from "../test-fixtures/external/guitar-tab-generator/cases.json";
import { planGuitarPhrase } from "../src/guitar-phrase-fingering";
const tuning = [64, 59, 55, 50, 45, 40];
for (const example of corpus.pathfinding)
  test(`upstream pathfinding ${example.id}: rest to chord, fixed positions`, () => {
    const notes = [
      { id: "G3", start: 0, duration: 1, string: 3, fret: 0 },
      { id: "B3", start: 2, duration: 1, string: 2, fret: 0 },
      ...example.contacts.map(([string, fret], i) => ({
        id: ["D4", "G4"][i],
        start: 3,
        duration: 1,
        string,
        fret,
      })),
    ];
    assert.deepEqual(
      notes.map((n) => tuning[n.string - 1] + n.fret),
      [55, 59, 62, 67],
    );
    const plan = planGuitarPhrase(notes);
    if (!example.feasible) {
      assert.equal(
        plan,
        null,
        "outside the conservative four-finger reach, not a pitch-generation error",
      );
      return;
    }
    assert.ok(plan);
    assert.deepEqual(
      plan.notes.map((n) => [n.id, n.string, n.fret, n.start]),
      notes.map((n) => [n.id, n.string, n.fret, n.start]),
    );
    assert.deepEqual(plan.states.find((s) => s.at === 1)!.fingers, {});
    assert.equal(
      Object.keys(plan.states.find((s) => s.at === 3)!.fingers).length,
      2,
    );
    assert.deepEqual(
      planGuitarPhrase(notes),
      plan,
      "repeat the real search, without a result cache",
    );
  });
for (const example of corpus.duplicatePitches)
  test(`upstream minimized failure: repeated ${example.pitch} pitches retain multiplicity`, () => {
    const notes = example.contacts.map(([string, fret], i) => ({
      id: `unison-${i}`,
      start: 0,
      duration: 1,
      string,
      fret,
    }));
    assert.ok(
      notes.every((n) => tuning[n.string - 1] + n.fret === example.midi),
    );
    const plan = planGuitarPhrase(notes);
    if (!example.feasible) {
      assert.equal(plan, null);
      return;
    }
    assert.ok(plan);
    assert.equal(
      plan.notes.length,
      notes.length,
      "equal pitches on distinct strings must not be collapsed",
    );
    assert.deepEqual(
      plan.notes.map((n) => n.id),
      notes.map((n) => n.id),
    );
    assert.equal(new Set(plan.notes.map((n) => n.string)).size, notes.length);
    assert.equal(Object.keys(plan.states[0].fingers).length, notes.length);
  });
test("upstream same-string conflict example remains impossible", () => {
  assert.equal(
    planGuitarPhrase([
      { id: "D4", start: 0, duration: 1, string: 2, fret: 3 },
      { id: "G4", start: 0, duration: 1, string: 2, fret: 8 },
    ]),
    null,
  );
});
