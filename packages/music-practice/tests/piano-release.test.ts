import test from "node:test";
import assert from "node:assert/strict";
import { planPianoPhrase } from "../src/piano-phrase-fingering";
import { comparePianoRelease } from "../test-fixtures/piano-release-comparison";
import type { PianoBenchmarkCase } from "../test-fixtures/piano-benchmark";
for (const hand of ["left", "right"] as const)
  for (const midis of [
    [60, 62, 64, 65, 67, 65, 64, 62],
    [60, 64, 65, 67, 69, 67, 65, 64],
  ])
    test(`released five-finger pattern remains stable for ${hand} ${midis}`, () => {
      const notes = midis.map((midi, i) => ({
        id: String(i),
        hand,
        midi,
        start: i * 0.25,
        duration: 0.25,
      }));
      const p = planPianoPhrase(notes, { bpm: 60 });
      assert.equal(p.status, "complete");
      assert.deepEqual(
        p.notes.map((n) => n.finger),
        hand === "right" ? [1, 2, 3, 4, 5, 4, 3, 2] : [5, 4, 3, 2, 1, 2, 3, 4],
      );
      assert.deepEqual(
        planPianoPhrase([...notes].reverse(), { bpm: 60 }).notes.reverse(),
        p.notes,
      );
    });
test("release comparison separates old-API exclusions from independently proven cross-hand conflicts", async () => {
  const base: PianoBenchmarkCase = {
    id: "mono",
    family: "synthetic",
    source: "ours",
    partition: "development",
    bpm: 60,
    notes: [{ id: "a", hand: "right", midi: 60, start: 0, duration: 1 }],
    labels: [{ id: "a", finger: 1, kind: "printed" }],
  };
  const chord = {
    ...base,
    id: "chord",
    notes: [60, 64, 67].map((midi, i) => ({
      id: String(i),
      hand: "right" as const,
      midi,
      start: 0,
      duration: 1,
    })),
    labels: [],
  };
  const conflict = {
    ...base,
    id: "conflict",
    notes: [
      ...base.notes,
      { ...base.notes[0], id: "b", hand: "left" as const },
    ],
    labels: [...base.labels, { ...base.labels[0], id: "b" }],
  };
  const r = await comparePianoRelease([base, chord, conflict]);
  assert.equal(r.comparable, 2);
  assert.deepEqual(
    r.excluded.map((c) => c.id),
    ["chord"],
  );
  assert.equal(r.rows[0].before, 1);
  assert.equal(r.rows[0].after, 1);
  assert.equal(r.rows[1].beforeCovered, 2);
  assert.equal(r.rows[1].afterCovered, 0);
  assert.deepEqual(r.rows[1].collisionNotes, ["a", "b"]);
  assert.ok(r.rows[1].diagnostics.every((d) => d.code === "hand_conflict"));
});
