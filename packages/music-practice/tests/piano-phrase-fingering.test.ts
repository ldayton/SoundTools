import test from "node:test";
import assert from "node:assert/strict";
import {
  planPianoPhrase,
  type PianoPhraseNote,
} from "../src/piano-phrase-fingering";
const n = (
  id: string,
  midi: number,
  start = 0,
  duration = 1,
  hand: "right" | "left" = "right",
  finger?: number,
): PianoPhraseNote => ({
  id,
  midi,
  start,
  duration,
  hand,
  ...(finger ? { finger } : {}),
});
test("ordinary chords, mirrored hands, compressed grips and octaves produce complete plans", () => {
  for (const hand of ["right", "left"] as const)
    for (const pitches of [
      [60, 64, 67],
      [60, 62, 64],
      [60, 72],
    ]) {
      const p = planPianoPhrase(
        pitches.map((m, i) => n(String(i), m, 0, 1, hand)),
      );
      assert.equal(p.status, "complete");
      assert.equal(p.notes.length, pitches.length);
      assert.equal(new Set(p.notes.map((x) => x.finger)).size, pitches.length);
      const digits = p.notes.map((x) => x.finger);
      assert.deepEqual(
        [...digits].sort((a, b) => (hand === "right" ? a - b : b - a)),
        digits,
      );
    }
});
test("one hand reserves held keys across voices, ties and mixed fresh attacks", () => {
  const notes = [
    n("bass", 55, 0, 4, "right", 1),
    n("a", 60, 0, 1, "right", 3),
    { ...n("tie", 60, 1, 1, "right", 3), tieFrom: "a" },
    n("fresh", 64, 1),
    n("last", 65, 2),
  ];
  const p = planPianoPhrase(notes);
  assert.equal(p.status, "complete");
  for (const s of p.hands.right.states) {
    assert.equal(s.fingers.bass, 1);
    for (const k of s.keys) if (k.midi !== 55) assert.notEqual(k.finger, 1);
  }
  assert.equal(p.notes[1].finger, p.notes[2].finger);
  assert.equal(p.notes[2].shift, false);
});
test("same-onset same-hand unisons retain two identities on one physical key", () => {
  const p = planPianoPhrase([n("a", 60, 0, 2), n("b", 60, 0, 1)]);
  assert.equal(p.status, "complete");
  assert.equal(p.notes.length, 2);
  assert.equal(p.notes[0].finger, p.notes[1].finger);
  assert.equal(p.hands.right.states[0].keys.length, 1);
  assert.equal(
    planPianoPhrase([n("a", 60, 0, 2), n("again", 60, 1)]).hands.right
      .diagnostic?.code,
    "overlapping_restrike",
  );
  assert.equal(
    planPianoPhrase([
      n("a", 60, 0, 2, "right", 1),
      n("b", 60, 0, 1, "right", 2),
    ]).hands.right.diagnostic?.code,
    "fixed_conflict",
  );
});
test("unsupported hands have no partial digits and do not suppress the other hand", () => {
  const p = planPianoPhrase([
    ...Array.from({ length: 6 }, (_, i) => n(String(i), 60 + i)),
    n("left", 48, 0, 1, "left"),
  ]);
  assert.equal(p.status, "partial");
  assert.equal(p.hands.right.diagnostic?.code, "too_many_keys");
  assert.deepEqual(p.hands.right.notes, []);
  assert.equal(p.hands.left.notes.length, 1);
  assert.equal(
    planPianoPhrase([n("r", 60), n("l", 60, 0, 1, "left")]).hands.left
      .diagnostic?.code,
    "hand_conflict",
  );
});
test("fixed fingers and configurable reach are hard constraints", () => {
  const p = planPianoPhrase([
    n("a", 60, 0, 1, "right", 1),
    n("b", 64, 0, 1, "right", 3),
    n("c", 67, 0, 1, "right", 5),
  ]);
  assert.deepEqual(
    p.notes.map((n) => n.finger),
    [1, 3, 5],
  );
  assert.equal(
    planPianoPhrase([n("a", 60), n("b", 72)], { maxSpan: 3 }).hands.right
      .diagnostic?.code,
    "reach",
  );
  assert.equal(
    planPianoPhrase([
      n("a", 60, 0, 1, "right", 1),
      n("b", 64, 0, 1, "right", 1),
    ]).hands.right.status,
    "unsupported",
  );
});
test("overlapping thumb passage is explicit; arbitrary initial crossed chords are unsupported", () => {
  const p = planPianoPhrase([
    n("held", 60, 0, 1.25, "right", 3),
    n("thumb", 62, 1, 1, "right", 1),
  ]);
  assert.equal(p.status, "complete");
  assert.ok(
    p.hands.right.states
      .flatMap((s) => s.events)
      .some((e) => e.kind === "thumb_under"),
  );
  assert.equal(
    planPianoPhrase([
      n("a", 60, 0, 1, "right", 3),
      n("b", 62, 0, 1, "right", 1),
    ]).hands.right.status,
    "unsupported",
  );
});
test("substitutions are opt-in, explicit and charged", () => {
  // A five-key opening locks all five digits; the later span requires moving
  // the held top note from 5 to 1 before attacking a higher octave.
  const notes = [
    ...[60, 62, 64, 65].map((m, i) =>
      n("release-" + i, m, 0, 1, "right", i + 1),
    ),
    n("held", 67, 0, 3),
    n("high", 79, 1, 1, "right", 5),
  ];
  assert.equal(planPianoPhrase(notes).hands.right.status, "unsupported");
  const p = planPianoPhrase(notes, { allowSubstitutions: true });
  assert.equal(p.status, "complete");
  assert.ok(
    p.hands.right.states
      .flatMap((s) => s.events)
      .some((e) => e.kind === "substitution"),
  );
  assert.ok(p.costs.substitution >= 18);
});
test("clock noise, tiny durations, ties and input invariance preserve complete identities", () => {
  const notes = Array.from({ length: 8 }, (_, i) =>
    n(String(i), 60 + (i % 3), i / 3, 1 / 3),
  );
  const p = planPianoPhrase(notes);
  assert.equal(p.status, "complete");
  assert.equal(p.notes.length, 8);
  assert.equal(
    planPianoPhrase([n("tiny", 60, 0, 1e-8)]).notes[0].finger >= 1,
    true,
  );
  const reversed = planPianoPhrase([...notes].reverse());
  assert.deepEqual(reversed.hands.right.states, p.hands.right.states);
  assert.deepEqual(reversed.notes.reverse(), p.notes);
  assert.equal(reversed.cost, p.cost);
  const shifted = planPianoPhrase(
    notes.map((n) => ({ ...n, start: n.start + 16 })),
  );
  assert.equal(shifted.status, "complete");
  assert.deepEqual(
    shifted.notes.map((n) => [n.finger, n.anchor]),
    p.notes.map((n) => [n.finger, n.anchor]),
  );
  assert.ok(Math.abs(shifted.cost - p.cost) < 1e-7);
  const plain = [n("a", 60, 0, 2)],
    split = [n("a", 60, 0, 1), { ...n("b", 60, 1), tieFrom: "a" }];
  assert.equal(planPianoPhrase(plain).cost, planPianoPhrase(split).cost);
});
test("bad identities, times, fingers, hands and ties are rejected", () => {
  const invalid = [
    [n("a", 60), n("a", 62, 1)],
    [n("a", 128)],
    [n("a", 60, -1)],
    [n("a", 60, 0, 0)],
    [n("a", 60, Number.MAX_VALUE, 1)],
    [n("a", 60), { ...n("b", 61, 1), tieFrom: "a" }],
    [n("a", 60), { ...n("b", 60, 2), tieFrom: "a" }],
    [{ ...n("a", 60), tieFrom: "missing" }],
    [n("a", 60), { ...n("b", 60, 1, 1, "left"), tieFrom: "a" }],
  ];
  for (const notes of invalid) assert.throws(() => planPianoPhrase(notes));
  assert.throws(() =>
    planPianoPhrase([
      n("a", 60),
      { ...n("b", 60, 1), tieFrom: "a" },
      { ...n("c", 60, 1), tieFrom: "a" },
    ]),
  );
  for (const profile of [
    { bpm: 0 },
    { maxSpan: 0 },
    { maxTransitions: 0 },
    { weights: { movement: NaN } },
  ])
    assert.throws(() => planPianoPhrase([], profile));
});
test("search bounds fail explicitly and dense phrases have retained operation counts", () => {
  const notes = Array.from({ length: 80 }, (_, beat) =>
    [60, 64, 67].map((m, i) => n(`${beat}:${i}`, m, beat)),
  ).flat();
  const p = planPianoPhrase(notes);
  assert.equal(p.status, "complete");
  assert.equal(p.notes.length, 240);
  assert.equal(p.hands.right.statistics.frames, 80);
  assert.ok(p.hands.right.statistics.transitions < 100000);
  for (const profile of [
    { maxNotes: 2 },
    { maxCandidates: 2 },
    { maxFrames: 2 },
    { maxTransitions: 1 },
  ])
    assert.equal(
      planPianoPhrase(notes, profile).hands.right.diagnostic?.code,
      "search_limit",
    );
});

test("oversized input returns explicit resource diagnostics before building frames", () => {
  const result = planPianoPhrase(
    Array.from({ length: 8001 }, (_, i) => n(String(i), 60, i)),
  );
  assert.equal(result.hands.right.diagnostic?.code, "search_limit");
  assert.equal(result.hands.left.diagnostic?.code, "search_limit");
  assert.equal(result.notes.length, 0);
});
