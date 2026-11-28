import test from "node:test";
import assert from "node:assert/strict";
import {
  planPianoPhrase,
  type PianoPhraseNote,
} from "../src/piano-phrase-fingering";
import { exhaustiveWholeHand } from "../test-fixtures/piano-whole-hand-oracle";
const note = (
  id: string,
  midi: number,
  start: number,
  duration = 1,
  finger?: number,
): PianoPhraseNote => ({ id, midi, start, duration, hand: "right", finger });
for (const hand of ["right", "left"] as const)
  for (const pitches of [
    [60, 64, 67],
    [60, 62, 64],
    [60, 67, 72],
    [61, 65, 68],
  ])
    test(`independent exhaustive chord-path optimum ${hand} ${pitches}`, () => {
      const notes = [
        ...pitches.map((m, i) => note(`a${i}`, m, 0)),
        ...pitches.map((m, i) => note(`b${i}`, m + 2, 1)),
      ].map((n) => ({ ...n, hand }));
      const expected = exhaustiveWholeHand(notes, hand, 90),
        actual = planPianoPhrase(notes, { bpm: 90 });
      assert.ok(expected.paths > 0);
      assert.equal(actual.status, "complete");
      assert.ok(
        Math.abs(actual.cost - expected.cost) < 1e-8,
        `${actual.cost} vs ${expected.cost}`,
      );
    });
test("independent exhaustive overlapping held-key optimum", () => {
  const notes = [
    note("held", 60, 0, 2, 1),
    note("a", 64, 0, 1, 3),
    note("b", 67, 0, 1, 5),
    note("c", 65, 1, 1, 4),
    note("d", 67, 1, 1, 5),
  ];
  const expected = exhaustiveWholeHand(notes, "right"),
    actual = planPianoPhrase(notes);
  assert.ok(expected.paths > 0);
  assert.equal(actual.status, "complete");
  assert.ok(Math.abs(actual.cost - expected.cost) < 1e-8);
});
function verify(notes: PianoPhraseNote[]) {
  const plan = planPianoPhrase(notes);
  assert.equal(
    plan.status,
    "complete",
    JSON.stringify(plan.hands.right.diagnostic),
  );
  assert.equal(plan.notes.length, notes.length);
  for (const hand of ["right", "left"] as const) {
    const h = plan.hands[hand];
    for (const [i, s] of h.states.entries()) {
      assert.equal(new Set(s.keys.map((k) => k.finger)).size, s.keys.length);
      for (const key of s.keys) {
        for (const id of key.noteIds) {
          const source = notes.find((n) => n.id === id)!;
          if (source.finger) assert.equal(key.finger, source.finger);
        }
        const previous = h.states[i - 1]?.keys.find(
          (k) => k.contactId === key.contactId,
        );
        if (previous) assert.equal(key.finger, previous.finger);
      }
    }
  }
  return plan;
}
test("seeded known-playable polyphony preserves fixed witnesses, identity and order", () => {
  let seed = 0x5eeda11;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let trial = 0; trial < 48; trial++) {
    const offset = (random() % 3) * 12,
      notes: PianoPhraseNote[] = [];
    for (const hand of ["right", "left"] as const) {
      const root = (hand === "right" ? 60 : 36) + offset;
      notes.push({
        ...note(`${hand}:held`, root, 0, 3, hand === "right" ? 1 : 5),
        hand,
      });
      for (let beat = 0; beat < 3; beat++) {
        const major = random() % 2 === 0;
        for (const [j, interval] of (major ? [4, 7] : [3, 7]).entries())
          notes.push({
            ...note(
              `${hand}:${beat}:${j}`,
              root + interval,
              beat,
              1,
              hand === "right" ? (j ? 5 : 3) : j ? 1 : 3,
            ),
            hand,
          });
      }
    }
    try {
      verify(notes.map(({ finger, ...n }) => n));
      const a = verify(notes),
        b = verify([...notes].reverse());
      for (const hand of ["right", "left"] as const)
        assert.deepEqual(a.hands[hand].states, b.hands[hand].states);
      assert.deepEqual(a.notes, [...b.notes].reverse());
    } catch (error) {
      // deletion minimization retains a replayable, self-contained data witness
      let minimal = [...notes];
      for (let i = minimal.length - 1; i >= 0; i--) {
        const candidate = minimal.filter((_, j) => i !== j);
        try {
          verify(candidate);
        } catch {
          minimal = candidate;
        }
      }
      throw new Error(
        `seed=0x5eeda11 trial=${trial} minimized=${JSON.stringify(minimal)}`,
        { cause: error },
      );
    }
  }
});
