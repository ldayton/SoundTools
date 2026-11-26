import test from "node:test";
import assert from "node:assert/strict";
import { planPianoPhrase } from "../src/piano-phrase-fingering";
import { exhaustiveErgonomicCost } from "../test-fixtures/piano-ergonomic-oracle";
import {
  loadPianoPlanner,
  pianoPlannerSources,
} from "../test-fixtures/piano-planner-loader";
for (const hand of ["right", "left"] as const)
  for (const midis of [
    [60, 64, 62],
    [60, 61, 63],
    [64, 65, 64],
    [60, 60, 62],
    [67, 72, 76],
    [72, 67, 64],
  ])
    test(`independent ergonomic optimum ${hand} ${midis}`, () => {
      const notes = midis.map((midi, i) => ({
          id: String(i),
          hand,
          midi,
          start: i * 0.25,
          duration: 0.25,
        })),
        oracle = exhaustiveErgonomicCost(midis, hand),
        p = planPianoPhrase(notes, { model: "ergonomic", bpm: 60 });
      assert.ok(oracle.paths > 0);
      assert.equal(p.status, "complete");
      assert.ok(
        Math.abs(p.cost - oracle.cost) < 1e-8,
        `${p.cost} vs ${oracle.cost}`,
      );
      assert.ok(
        Math.abs(
          p.cost -
            p.hands[hand].states.reduce(
              (sum, s) =>
                sum + Object.values(s.costs).reduce((a, b) => a + b, 0),
              0,
            ),
        ) < 1e-8,
      );
    });
test("seeded two-voice witness keeps hard anchors, mirrors and representation invariance under experimental scoring", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const notes = [
      {
        id: "held",
        voice: "bass",
        hand: "right" as const,
        midi: 55,
        start: 0,
        duration: 4,
        finger: 1,
      },
      ...[60, 62, 64].map((midi, i) => ({
        id: String(i),
        voice: "melody",
        hand: "right" as const,
        midi: midi + (seed % 2),
        start: i,
        duration: 1,
        finger: i + 2,
      })),
    ];
    const p = planPianoPhrase(notes, {
      model: "ergonomic",
      bpm: 60 + seed * 5,
    });
    assert.equal(p.status, "complete");
    assert.equal(p.notes[0].finger, 1);
    assert.deepEqual(
      planPianoPhrase([...notes].reverse(), {
        model: "ergonomic",
        bpm: 60 + seed * 5,
      }).notes.reverse(),
      p.notes,
    );
  }
});
test("compiling mutation of comfortable pair costs changes observable arithmetic", async () => {
  const from = "0.3 * deviation * deviation";
  assert.equal(pianoPlannerSources.ergonomics.split(from).length, 2);
  const mutant = await loadPianoPlanner({
    ...pianoPlannerSources,
    ergonomics: pianoPlannerSources.ergonomics.replace(
      from,
      "30 * deviation * deviation",
    ),
  });
  const ns = [60, 64, 62].map((midi, i) => ({
      id: String(i),
      hand: "right" as const,
      midi,
      start: i * 0.25,
      duration: 0.25,
      finger: [1, 5, 2][i],
    })),
    expected = exhaustiveErgonomicCost([60, 64, 62], "right", [1, 5, 2]);
  assert.ok(
    Math.abs(
      planPianoPhrase(ns, { model: "ergonomic", bpm: 60 }).cost - expected.cost,
    ) < 1e-8,
  );
  assert.throws(
    () =>
      assert.ok(
        Math.abs(
          mutant(ns, { model: "ergonomic", bpm: 60 }).cost - expected.cost,
        ) < 1e-8,
      ),
    assert.AssertionError,
  );
});
