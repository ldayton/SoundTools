import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parncuttPairFeatures,
  parncuttTripleFeatures,
  parncuttNoteFeatures,
  parncuttSpanLimits,
  parncuttUniformWeights,
  parncuttRuleKeys,
  type PianoDigit,
  type ParncuttWeights,
  type ParncuttFeatures,
} from "../research/chirality/rules";
import {
  decodeParncuttSequence,
  evaluateParncuttPath,
  type ParncuttInputNote,
} from "../research/chirality/decode";
import { planParncuttPhrase } from "../research/chirality/constrained";
import { neuralPhysicalViolations } from "../test-fixtures/piano-neural-comparison";

const oracle = JSON.parse(
  readFileSync(
    new URL("../test-fixtures/piano-parncutt-parity.json", import.meta.url),
    "utf8",
  ),
) as {
  pairSpans: number[];
  pairFeatures: number[][];
  tripleSteps: number[];
  tripleFeatures: number[][];
  noteFeatures: number[][];
  models: Record<string, number[]>;
  paths: {
    midis: number[];
    hand: "right" | "left";
    model: string;
    fingers: PianoDigit[];
    features: ParncuttFeatures;
    cost: number;
    gates: number;
  }[];
};
const digit = (n: number) => n as PianoDigit;
const weights = (values: number[]) =>
  Object.fromEntries(
    parncuttRuleKeys.map((k, i) => [k, values[i]]),
  ) as ParncuttWeights;
const input = (midis: number[]): ParncuttInputNote[] =>
  midis.map((midi, i) => ({ id: String(i), midi }));
const black = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

test("Parncutt pair grids agree with pinned Python for all digits, signed spans and realizable key colors", () => {
  let index = 0,
    checked = 0;
  for (const d of oracle.pairSpans)
    for (let a = 1; a <= 5; a++)
      for (let b = 1; b <= 5; b++)
        for (const x of [false, true])
          for (const y of [false, true]) {
            const expected = oracle.pairFeatures[index++];
            for (const hand of ["right", "left"] as const) {
              const delta = d * (hand === "right" ? 1 : -1);
              const midi = Array.from({ length: 72 }, (_, i) => i + 24).find(
                (m) => black(m) === x && black(m + delta) === y,
              );
              if (midi === undefined) continue;
              const f = parncuttPairFeatures(
                { midi, finger: digit(a) },
                { midi: midi + delta, finger: digit(b) },
                hand,
              );
              assert.deepEqual(
                [f.str, f.sma, f.lar, f["3t4"], f.bl4, f.pa1],
                expected,
                JSON.stringify({ d, a, b, x, y, hand }),
              );
              checked++;
            }
          }
  assert.ok(checked > 5000);
  assert.equal(index, oracle.pairFeatures.length);
});
test("Parncutt triple and per-note rules agree with independent Python grids", () => {
  let index = 0;
  for (const d of oracle.tripleSteps)
    for (const e of oracle.tripleSteps)
      for (let a = 1; a <= 5; a++)
        for (let b = 1; b <= 5; b++)
          for (let c = 1; c <= 5; c++) {
            const expected = oracle.tripleFeatures[index++];
            for (const hand of ["right", "left"] as const) {
              const s = hand === "right" ? 1 : -1;
              const f = parncuttTripleFeatures(
                { midi: 60, finger: digit(a) },
                { midi: 60 + s * d, finger: digit(b) },
                { midi: 60 + s * (d + e), finger: digit(c) },
                hand,
              );
              assert.deepEqual(
                [f.pcc, f.pcs, f["345"]],
                expected,
                JSON.stringify({ d, e, a, b, c, hand }),
              );
            }
          }
  assert.equal(index, oracle.tripleFeatures.length);
  index = 0;
  for (let f = 1; f <= 5; f++)
    for (const x of [false, true])
      for (const prev of [undefined, false, true])
        for (const next of [undefined, false, true]) {
          const result = parncuttNoteFeatures(
            x ? 61 : 60,
            digit(f),
            prev === undefined ? undefined : prev ? 61 : 60,
            next === undefined ? undefined : next ? 61 : 60,
          );
          assert.deepEqual(
            [result.wea, result.bl1, result.bl5],
            oracle.noteFeatures[index++],
          );
        }
  assert.equal(index, oracle.noteFeatures.length);
  // Explicit asymmetric paper bounds prevent a mirrored-grid error hiding a table bug.
  assert.deepEqual(parncuttSpanLimits(2, 1), [-10, -8, -5, -1, 3, 5]);
  assert.deepEqual(parncuttSpanLimits(5, 1), [-15, -13, -10, -7, -1, 1]);
  assert.ok(Object.isFrozen(parncuttSpanLimits(1, 2)));
});
test("decoder matches pinned native synthetic paths, feature totals and finite gate costs", () => {
  for (const row of oracle.paths) {
    const result = decodeParncuttSequence(
      input(row.midis),
      row.hand,
      weights(oracle.models[row.model]),
    );
    assert.equal(result.status, "complete");
    if (result.status !== "complete") continue;
    assert.deepEqual(result.fingers, row.fingers, JSON.stringify(row));
    assert.deepEqual(result.features, row.features);
    assert.equal(result.gateViolations, row.gates);
    assert.ok(Math.abs(result.cost - row.cost) < 1e-6);
  }
});
test("exhaustive enumeration verifies global optimum, including authored anchors", () => {
  for (const hand of ["left", "right"] as const)
    for (const midis of [
      [60, 61, 64, 62],
      [72, 60, 36],
      [60, 60, 60],
    ]) {
      const notes = input(midis);
      notes[1] = { ...notes[1], finger: 3 };
      const w = weights(oracle.models.synthetic),
        result = decodeParncuttSequence(notes, hand, w);
      assert.equal(result.status, "complete");
      if (result.status !== "complete") continue;
      let best = Infinity;
      const visit = (digits: PianoDigit[]) => {
        if (digits.length === notes.length) {
          best = Math.min(
            best,
            evaluateParncuttPath(notes, digits, hand, w).cost,
          );
          return;
        }
        for (let f = 1; f <= 5; f++)
          if (
            notes[digits.length].finger === undefined ||
            notes[digits.length].finger === f
          )
            visit([...digits, digit(f)]);
      };
      visit([]);
      assert.ok(Math.abs(result.cost - best) < 1e-6);
      assert.equal(result.fingers[1], 3);
    }
});
test("validation, deterministic ties and search limits do not yield partial guesses", () => {
  const zero = weights(Array(12).fill(0));
  assert.deepEqual(
    decodeParncuttSequence(input([60, 60, 60]), "right", zero).fingers,
    [1, 1, 1],
  );
  assert.deepEqual(decodeParncuttSequence([], "left").fingers, []);
  for (const notes of [
    input([-1]),
    input([128]),
    input([60.5]),
    [
      { id: "x", midi: 60 },
      { id: "x", midi: 62 },
    ],
    [{ id: "", midi: 60 }],
    [{ id: "x", midi: 60, finger: 6 as PianoDigit }],
  ])
    assert.throws(() => decodeParncuttSequence(notes, "right"));
  for (const value of [-1, NaN, Infinity, 10001])
    assert.throws(() =>
      decodeParncuttSequence(input([60]), "right", {
        ...parncuttUniformWeights,
        str: value,
      }),
    );
  assert.throws(() =>
    decodeParncuttSequence(input([60]), "right", {
      ...parncuttUniformWeights,
      extra: 0,
    } as ParncuttWeights),
  );
  assert.throws(() => decodeParncuttSequence(input([60]), "bad" as "right"));
  for (const options of [{ maxTransitions: 0 }, { maxNotes: 4001 }])
    assert.throws(() =>
      decodeParncuttSequence(
        input([60]),
        "right",
        parncuttUniformWeights,
        options,
      ),
    );
  for (const options of [{ maxTransitions: 1 }, { maxNotes: 2 }]) {
    const result = decodeParncuttSequence(
      input([60, 62, 64]),
      "right",
      parncuttUniformWeights,
      options,
    );
    assert.equal(result.status, "unsupported");
    assert.deepEqual(result.fingers, []);
  }
  const notes = input(Array.from({ length: 240 }, (_, i) => 60 + (i % 12))),
    before = JSON.stringify(notes);
  const result = decodeParncuttSequence(notes, "right");
  assert.equal(result.status, "complete");
  assert.equal(result.statistics.peakStates, 25);
  assert.equal(result.statistics.transitions, 25 + 238 * 125);
  assert.equal(JSON.stringify(notes), before);
});
test("whole-hand adapter preserves source anchors, ties, occupancy and safe fallback", () => {
  assert.throws(() =>
    planParncuttPhrase([], { ...parncuttUniformWeights, str: NaN }),
  );
  const notes = [
    {
      id: "root",
      hand: "right" as const,
      midi: 60,
      start: 0,
      duration: 1,
      finger: 2,
    },
    {
      id: "tie",
      hand: "right" as const,
      midi: 60,
      start: 1,
      duration: 1,
      tieFrom: "root",
    },
    { id: "other", hand: "right" as const, midi: 64, start: 1, duration: 1 },
  ];
  const before = JSON.stringify(notes),
    result = planParncuttPhrase(notes, parncuttUniformWeights);
  assert.equal(result.plan.hands.right.status, "complete");
  assert.deepEqual(
    result.plan.notes.filter((n) => n.midi === 60).map((n) => n.finger),
    [2, 2],
  );
  assert.equal(
    neuralPhysicalViolations(
      notes,
      new Map(result.plan.notes.map((n) => [n.id, n.finger])),
    ).length,
    0,
  );
  assert.equal(JSON.stringify(notes), before);
  const limited = planParncuttPhrase(
    notes,
    parncuttUniformWeights,
    {},
    { maxTransitions: 1 },
  );
  assert.equal(limited.selections.right.reason, "search-limit");
  assert.equal(limited.plan.hands.right.status, "complete");
  const impossible = notes
    .filter((n) => !n.tieFrom)
    .map((n) => ({ ...n, start: 0, finger: 1 }));
  const rejected = planParncuttPhrase(impossible, parncuttUniformWeights);
  assert.equal(rejected.selections.right.reason, "physical-rejected");
  assert.equal(rejected.plan.hands.right.status, "unsupported");
  const conflict = [
    { id: "r", hand: "right" as const, midi: 60, start: 0, duration: 1 },
    { id: "l", hand: "left" as const, midi: 60, start: 0, duration: 1 },
  ];
  assert.equal(
    planParncuttPhrase(conflict, parncuttUniformWeights).plan.status,
    "unsupported",
  );
  // Global bound is checked before normalization. No partial result or quadratic
  // normalization is attempted on an out-of-budget score.
  const oversized = Array.from({ length: 8001 }, (_, i) => ({
    id: String(i),
    hand: "right" as const,
    midi: 60,
    start: i,
    duration: 1,
  }));
  const bounded = planParncuttPhrase(oversized, parncuttUniformWeights);
  assert.equal(bounded.plan.status, "unsupported");
  assert.equal(bounded.selections.right.reason, "search-limit");
  assert.deepEqual(bounded.plan.notes, []);
});
