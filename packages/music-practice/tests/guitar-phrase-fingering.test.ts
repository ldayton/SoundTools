import test from "node:test";
import assert from "node:assert/strict";
import {
  planGuitarPhrase,
  scoreGuitarHand,
  guitarHandCandidates,
  type GuitarPhraseNote,
} from "../src/guitar-phrase-fingering";
const note = (
  id: string,
  start: number,
  string: number,
  fret: number,
  duration = 1,
): GuitarPhraseNote => ({ id, start, string, fret, duration });
const cost = (fingers: (number | null)[], position: number, capo = 0) =>
  Object.values(
    scoreGuitarHand([null, 5, null, 2, null, null], fingers, position, {
      capo,
    })!,
  ).reduce((a, b) => a + b, 0);

test("ordinary ring/pinky reaches beat the three-fret index-middle stretch", () => {
  assert.ok(
    cost([null, 4, null, 1, null, null], 2) <
      cost([null, 2, null, 1, null, null], 3),
  );
  assert.ok(
    cost([null, 3, null, 1, null, null], 2) <
      cost([null, 2, null, 1, null, null], 3),
  );
  assert.ok(
    cost([null, 2, null, 1, null, null], 3, 7) <
      cost([null, 2, null, 1, null, null], 3),
  );
});
test("held bass and tied melody remain complete hand contacts through attacks and releases", () => {
  const input = [
    note("bass", 0, 5, 5, 3),
    note("a", 0, 3, 2),
    { ...note("b", 1, 3, 2), tieFrom: "a" },
    note("c", 2, 4, 4),
  ];
  const plan = planGuitarPhrase(input)!;
  assert.ok(plan);
  assert.equal(plan.notes[1].finger, plan.notes[2].finger);
  for (const state of plan.states) {
    assert.equal(state.fingers.bass, plan.notes[0].finger);
    for (const [id, finger] of Object.entries(state.fingers))
      if (id !== "bass") assert.notEqual(finger, state.fingers.bass);
  }
  assert.equal(plan.states[0].until, 2); // tie is one sounding contact, not a fresh attack
  assert.equal(
    plan.cost,
    Object.values(plan.costs).reduce((a, b) => a + b, 0),
  );
  assert.deepEqual(input[0], note("bass", 0, 5, 5, 3));
});
test("repeated notes retain fingers and occurrence identity is preserved", () => {
  const input = Array.from({ length: 8 }, (_, i) => note(String(i), i, 1, 3));
  const plan = planGuitarPhrase(input)!;
  assert.equal(new Set(plan.notes.map((n) => n.finger)).size, 1);
  assert.deepEqual(
    plan.notes.map((n) => n.id),
    input.map((n) => n.id),
  );
  assert.deepEqual(
    planGuitarPhrase([...input].reverse())!.notes.reverse(),
    plan.notes,
  );
});
test("open strings, legal barres, and blocked barres use shared hard constraints", () => {
  assert.ok(
    guitarHandCandidates([null, null, 2, 2, 2, null]).some(
      (p) => p.fingerCount === 1,
    ),
  );
  assert.ok(
    guitarHandCandidates([null, null, 2, 0, 2, null]).every(
      (p) => p.fingers[2] !== p.fingers[4],
    ),
  );
  assert.equal(
    scoreGuitarHand(
      [null, null, 2, null, 2, null],
      [null, null, 1, null, 1, null],
      2,
    ),
    null,
  );
  assert.equal(
    scoreGuitarHand(
      [null, null, 2, 3, null, null],
      [null, null, 1, 1, null, null],
      2,
    ),
    null,
  );
  assert.equal(planGuitarPhrase([note("open", 0, 1, 0)])!.notes[0].finger, 0);
  assert.equal(
    planGuitarPhrase([note("a", 0, 1, 2), note("b", 0, 1, 3)]),
    null,
  );
  assert.equal(planGuitarPhrase([note("a", 0, 1, 2)], { maxFingers: 0 }), null);
});
test("rests release contacts, and the planner can prepare a later position", () => {
  const plan = planGuitarPhrase([note("a", 0, 1, 2), note("b", 4, 1, 14)])!;
  assert.ok(plan);
  assert.ok(
    plan.states.some((s) => s.at === 1 && Object.keys(s.fingers).length === 0),
  );
  assert.ok(plan.notes[1].position > plan.notes[0].position);
});
test("invalid events, ties, and profiles are rejected without fabricated plans", () => {
  for (const input of [
    [note("x", 0, 7, 2)],
    [note("x", 0, 1, -1)],
    [note("x", 0, 1, 2, 0)],
    [note("x", 0, 1, 2), note("x", 1, 1, 2)],
    [{ ...note("x", 0, 1, 2), tieFrom: "missing" }],
  ])
    assert.throws(() => planGuitarPhrase(input));
  assert.throws(() =>
    planGuitarPhrase([
      note("a", 0, 1, 2),
      { ...note("b", 2, 1, 2), tieFrom: "a" },
    ]),
  );
  for (const profile of [
    { bpm: 0 },
    { capo: 25 },
    { weights: { stretch: -1 } },
    { scaleLength: NaN },
  ])
    assert.throws(() => planGuitarPhrase([], profile));
  assert.deepEqual(planGuitarPhrase([])!.notes, []);
});

test("held common fingers survive chord changes; release boundaries permit new fingers", () => {
  const plan = planGuitarPhrase([
    note("common", 0, 3, 2, 2),
    note("low", 0, 5, 5),
    note("new", 1, 4, 4),
    note("released", 2, 3, 5),
  ])!;
  assert.ok(plan);
  const held = plan.notes.find((n) => n.id === "common")!.finger;
  assert.equal(plan.states[0].fingers.common, held);
  assert.equal(plan.states[1].fingers.common, held);
  assert.equal(plan.states[2].fingers.common, undefined);
});

test("held-finger substitutions require explicit permission and carry a visible cost", () => {
  const input = [
    note("held", 0, 1, 4, 2),
    note("low", 0, 2, 1),
    note("high", 1, 2, 8),
  ];
  assert.equal(planGuitarPhrase(input), null);
  const plan = planGuitarPhrase(input, { allowSubstitutions: true })!;
  assert.ok(plan);
  assert.ok(plan.costs.substitution >= 18);
  assert.notEqual(plan.states[0].fingers.held, plan.states[1].fingers.held);
});

test("a future attack changes the opening grip before a bass finger becomes locked", () => {
  const opening = [note("bass", 0, 5, 5, 2), note("melody", 0, 3, 2)];
  const local = planGuitarPhrase(opening)!,
    phrase = planGuitarPhrase([...opening, note("next", 1, 4, 6)])!;
  assert.equal(local.notes[0].finger, 4);
  assert.equal(phrase.notes[0].finger, 3);
  assert.equal(phrase.notes[2].finger, 4);
  assert.equal(phrase.states[0].fingers.bass, phrase.states[1].fingers.bass);
});
