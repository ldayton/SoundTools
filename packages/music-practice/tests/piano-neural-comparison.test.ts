import test from "node:test";
import assert from "node:assert/strict";
import {
  neuralContacts,
  neuralPhysicalViolations,
  rawNeuralPlan,
  constrainedNeuralPlan,
  type NeuralHands,
} from "../test-fixtures/piano-neural-comparison";
import type { PianoPhraseNote } from "../src/piano-phrase-fingering";
const n = (
  id: string,
  midi: number,
  start = 0,
  duration = 1,
  finger?: number,
): PianoPhraseNote => ({
  id,
  midi,
  start,
  duration,
  hand: "right",
  ...(finger ? { finger } : {}),
});
const prediction = (ids: string[], ...digits: number[][]): NeuralHands => ({
  right: {
    contacts: ids,
    candidates: digits.map((fingers, i) => ({ fingers, logProbability: -i })),
    elapsedMs: 0,
  },
});
test("neural inputs combine physical ties and unisons while preserving all source identities", () => {
  const ns = [
    n("a", 60),
    { ...n("b", 60, 1, 2), tieFrom: "a" },
    n("c", 60, 0, 0.5),
  ];
  const cs = neuralContacts(ns.reverse());
  assert.equal(cs.length, 1);
  assert.deepEqual(cs[0].ids, ["a", "c", "b"]);
  assert.equal(cs[0].duration, 3);
  assert.throws(() =>
    neuralContacts([n("a", 60), { ...n("b", 62, 1), tieFrom: "a" }]),
  );
  assert.throws(() =>
    neuralContacts([n("a", 60, 0, 1, 1), n("b", 60, 0, 1, 2)]),
  );
});
test("raw scoring retains invalid neural choices for a separate safety audit", () => {
  const ns = [n("a", 60, 0, 2), n("b", 64, 1)],
    pred = prediction(["a", "b"], [1, 1]);
  const raw = rawNeuralPlan(ns, pred, 60);
  assert.deepEqual(
    raw.notes.map((n) => n.finger),
    [1, 1],
  );
  assert.deepEqual(
    neuralPhysicalViolations(
      ns,
      new Map(raw.notes.map((n) => [n.id, n.finger])),
    ).map((v) => v.code),
    ["finger_double_booked"],
  );
});
test("constrained selection uses ranked model candidates without consulting references", () => {
  const ns = [n("a", 60, 0, 2), n("b", 64, 1)],
    pred = prediction(["a", "b"], [1, 1], [1, 3]);
  const r = constrainedNeuralPlan(ns, pred, 60);
  assert.equal(r.selected.right, 1);
  assert.equal(r.plan.status, "complete");
  assert.deepEqual(
    r.plan.notes.map((n) => n.finger),
    [1, 3],
  );
  assert.equal(
    neuralPhysicalViolations(
      ns,
      new Map(r.plan.notes.map((n) => [n.id, n.finger])),
    ).length,
    0,
  );
  const fallback = constrainedNeuralPlan(
    ns,
    prediction(["a", "b"], [1, 1]),
    60,
  );
  assert.equal(fallback.selected.right, null);
  assert.equal(fallback.plan.status, "complete");
});
test("constrained selection preserves source anchors and rejects corrupt or missing model outputs", () => {
  const ns = [n("a", 60, 0, 1, 2)];
  assert.throws(() => rawNeuralPlan(ns, prediction(["wrong"], [2]), 60));
  assert.throws(() => rawNeuralPlan(ns, prediction(["a"], [6]), 60));
  assert.throws(() => rawNeuralPlan(ns, prediction(["a"], [1]), 60));
  assert.throws(() => rawNeuralPlan(ns, {}, 60));
  assert.throws(() => constrainedNeuralPlan(ns, {}, 60));
  assert.equal(
    constrainedNeuralPlan(ns, prediction(["a"], [2]), 60).plan.notes[0].finger,
    2,
  );
});
test("both-hand key conflicts remain unsupported after neural filtering", () => {
  const ns = [n("a", 60), { ...n("b", 60), hand: "left" as const }];
  const p = {
    ...prediction(["a"], [1]),
    left: {
      contacts: ["b"],
      candidates: [{ fingers: [5], logProbability: 0 }],
      elapsedMs: 0,
    },
  };
  const r = constrainedNeuralPlan(ns, p, 60);
  assert.equal(r.plan.status, "unsupported");
  assert.equal(r.plan.notes.length, 0);
  assert.equal(
    neuralPhysicalViolations(
      ns,
      new Map([
        ["a", 1],
        ["b", 5],
      ]),
    )[0].code,
    "cross_hand_key",
  );
});
