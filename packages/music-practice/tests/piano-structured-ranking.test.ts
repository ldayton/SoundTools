import test from "node:test";
import assert from "node:assert/strict";
import {
  planPianoPhrase,
  type PianoPhraseNote,
} from "../src/piano-phrase-fingering";
import {
  initialRankingWeights,
  rankPianoPhrase,
  pianoPlanRankingFeatures,
  rankingDot,
  updateRankingWeights,
  pianoRankingFeatures,
} from "../test-fixtures/piano-structured-ranking";

const phrase = (midis = [60, 62, 64]): PianoPhraseNote[] =>
  midis.map((midi, i) => ({
    id: String(i),
    hand: "right",
    midi,
    start: i,
    duration: 1,
  }));
test("zero contextual coefficients preserve exact classic paths, costs and diagnostics", () => {
  for (const notes of [
    phrase(),
    phrase([61, 62, 63, 64, 65, 66, 67]),
    phrase([60, 60]),
    [
      ...phrase(),
      { id: "bass", hand: "left" as const, midi: 48, start: 0, duration: 3 },
    ],
    [
      ...phrase(),
      { id: "unison", hand: "right" as const, midi: 60, start: 0, duration: 1 },
    ],
    phrase([30, 100]).map((n) => ({ ...n, start: 0 })),
  ]) {
    const before = JSON.stringify(notes);
    assert.deepEqual(
      rankPianoPhrase(notes, initialRankingWeights(), "structured"),
      planPianoPhrase(notes),
    );
    assert.equal(JSON.stringify(notes), before);
  }
});
test("raw scalar features add to the original cost without multiplying coefficients twice", () => {
  const notes = phrase([60, 65, 63, 63, 72]);
  const plan = rankPianoPhrase(notes, initialRankingWeights(), "scalar");
  const f = pianoPlanRankingFeatures(notes, plan, "scalar");
  assert.ok(
    Math.abs(rankingDot(f, initialRankingWeights()) - plan.cost) < 1e-8,
  );
  const weights = { posture: 2, movement: 0.3, repeat: 4, crossing: 2 };
  assert.deepEqual(
    rankPianoPhrase(notes, weights, "scalar").notes.map((n) => n.finger),
    planPianoPhrase(notes, { weights }).notes.map((n) => n.finger),
  );
});
test("exact constrained and loss-augmented decoders agree with exhaustive digit paths", () => {
  const notes = phrase([60, 62, 60]),
    weights = {
      ...initialRankingWeights(),
      "turn:1": -2,
      "pair:step:1:2": -1.7,
    };
  const gold = new Map([
    ["0", 2],
    ["2", 2],
  ]);
  const candidates = [];
  for (let a = 1; a <= 5; a++)
    for (let b = 1; b <= 5; b++)
      for (let c = 1; c <= 5; c++) {
        const fixed = notes.map((n, i) => ({ ...n, finger: [a, b, c][i] }));
        const plan = rankPianoPhrase(fixed, weights, "structured");
        if (plan.status !== "complete") continue;
        const f = pianoPlanRankingFeatures(notes, plan, "structured");
        candidates.push({ digits: [a, b, c], cost: rankingDot(f, weights) });
      }
  const resultCost = (plan: ReturnType<typeof rankPianoPhrase>) =>
    rankingDot(pianoPlanRankingFeatures(notes, plan, "structured"), weights);
  const compatible = rankPianoPhrase(notes, weights, "structured", {
    compatible: gold,
  });
  const best = Math.min(
    ...candidates
      .filter((c) => c.digits[0] === 2 && c.digits[2] === 2)
      .map((c) => c.cost),
  );
  assert.ok(Math.abs(resultCost(compatible) - best) < 1e-8);
  const loss = (digits: number[]) => +(digits[0] !== 2) + +(digits[2] !== 2);
  const augmented = rankPianoPhrase(notes, weights, "structured", {
    loss: gold,
  });
  assert.ok(
    Math.abs(
      resultCost(augmented) -
        loss(augmented.notes.map((n) => n.finger)) -
        Math.min(...candidates.map((c) => c.cost - loss(c.digits))),
    ) < 1e-8,
  );
  // The unannotated middle attack is optimized, not assigned pseudo-gold.
  assert.equal(compatible.notes[0].finger, 2);
  assert.equal(compatible.notes[2].finger, 2);
});
test("reference masks preserve source anchors, tie aliases and hard constraints", () => {
  const notes = [
    { ...phrase()[0], finger: 1 },
    {
      id: "tie",
      hand: "right" as const,
      midi: 60,
      start: 1,
      duration: 1,
      tieFrom: "0",
    },
  ];
  assert.equal(
    rankPianoPhrase(notes, initialRankingWeights(), "scalar", {
      compatible: new Map([["tie", 2]]),
    }).hands.right.status,
    "unsupported",
  );
  const supported = rankPianoPhrase(notes, initialRankingWeights(), "scalar", {
    compatible: new Map([["tie", 1]]),
  });
  assert.deepEqual(
    supported.notes.map((n) => n.finger),
    [1, 1],
  );
  const impossible = phrase([60, 64]).map((n) => ({
    ...n,
    start: 0,
    finger: 1,
  }));
  assert.equal(
    rankPianoPhrase(impossible, initialRankingWeights(), "structured").hands
      .right.status,
    "unsupported",
  );
  assert.equal(
    rankPianoPhrase(phrase(), initialRankingWeights(), "structured", {
      maxTransitions: 1,
    }).hands.right.diagnostic?.code,
    "search_limit",
  );
});
test("learning update lowers preferred costs, projects scalar weights and rejects nonfinite inputs", () => {
  const w = updateRankingWeights(
    initialRankingWeights(),
    { posture: 1, "turn:2": 1 },
    { posture: 4, "turn:3": 1 },
    "structured",
    0.1,
    0,
    1,
  );
  assert.ok(w.posture > 1);
  assert.ok(w["turn:2"] < 0);
  assert.ok(w["turn:3"] > 0);
  assert.equal(
    updateRankingWeights(
      initialRankingWeights(),
      { posture: 100 },
      {},
      "scalar",
      1,
      0,
      1,
    ).posture,
    0,
  );
  assert.throws(() => rankPianoPhrase(phrase(), { posture: NaN }, "scalar"));
  assert.throws(() => rankPianoPhrase(phrase(), { posture: -1 }, "scalar"));
  assert.throws(() =>
    rankPianoPhrase(phrase(), {}, "scalar", { loss: new Map([["bogus", 1]]) }),
  );
});
test("context features reset at rests, voice changes and ambiguous chord attacks", () => {
  const notes = phrase(),
    f = pianoRankingFeatures(notes, "structured");
  const plan = planPianoPhrase(notes),
    s = plan.hands.right.states;
  const frame = (i: number) => ({
    hand: "right" as const,
    at: s[i].at,
    until: s[i].until,
    anchor: s[i].anchor,
    fingers: s[i].fingers,
    costs: s[i].costs,
    active: [
      {
        id: notes[i].id,
        hand: "right" as const,
        midi: notes[i].midi,
        start: i,
        end: i + 1,
        noteIds: [notes[i].id],
        voice: i === 1 ? "changed" : undefined,
      },
    ],
  });
  assert.ok(
    !Object.keys(f.edge(frame(0), frame(1))).some((k) => k.startsWith("pair:")),
  );
});
