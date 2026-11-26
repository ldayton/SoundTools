import test from "node:test";
import assert from "node:assert/strict";
import {
  chiralityCandidateHands,
  type ChiralityHand,
} from "../test-fixtures/piano-chirality-comparison";
import {
  constrainedNeuralPlan,
  rawNeuralPlan,
  neuralPhysicalViolations,
} from "../test-fixtures/piano-neural-comparison";
const notes = [
  { id: "lo", hand: "right" as const, midi: 60, start: 0, duration: 1 },
  { id: "hi", hand: "right" as const, midi: 64, start: 0, duration: 1 },
];
const row = (fingers = [1, 3]): ChiralityHand => ({
  contacts: ["lo", "hi"],
  predictions: {
    published: {
      fingers,
      featureMs: 1,
      decodeMs: 1,
      nativeGateViolations: 0,
      ruleFeatures: { str: 0 },
    },
    uniform: {
      fingers: [1, 2],
      featureMs: 1,
      decodeMs: 1,
      nativeGateViolations: 0,
      ruleFeatures: { str: 0 },
    },
  },
});
test("Chirality artifact adapter selects published/uniform modes and rejects malformed identities", () => {
  assert.deepEqual(
    chiralityCandidateHands(notes, { right: row() }, "published").right!
      .candidates[0].fingers,
    [1, 3],
  );
  assert.deepEqual(
    chiralityCandidateHands(notes, { right: row() }, "uniform").right!
      .candidates[0].fingers,
    [1, 2],
  );
  assert.throws(() => chiralityCandidateHands(notes, {}, "published"));
  assert.throws(() =>
    chiralityCandidateHands(
      notes,
      { right: { ...row(), contacts: ["hi", "lo"] } },
      "published",
    ),
  );
  assert.throws(() =>
    chiralityCandidateHands(notes, { right: row([1, 6]) }, "published"),
  );
  assert.throws(() =>
    chiralityCandidateHands(notes, { right: row([1]) }, "published"),
  );
  assert.throws(() =>
    chiralityCandidateHands(
      notes.map((n) => ({ ...n, finger: 1 })),
      { right: row() },
      "published",
    ),
  );
  const bad = row();
  bad.predictions.published.featureMs = NaN;
  assert.throws(() =>
    chiralityCandidateHands(notes, { right: bad }, "published"),
  );
});
test("native flattening can fail held-key safety; constrained evaluation retains safe fallback", () => {
  const predictions = chiralityCandidateHands(
    notes,
    { right: row([2, 2]) },
    "published",
  );
  const raw = rawNeuralPlan(notes, predictions, 120);
  assert.ok(
    neuralPhysicalViolations(
      notes,
      new Map(raw.notes.map((n) => [n.id, n.finger])),
    ).some((v) => v.code === "finger_double_booked"),
  );
  const constrained = constrainedNeuralPlan(notes, predictions, 120);
  assert.equal(constrained.selected.right, null);
  assert.equal(constrained.plan.hands.right.status, "complete");
  assert.equal(
    neuralPhysicalViolations(
      notes,
      new Map(constrained.plan.notes.map((n) => [n.id, n.finger])),
    ).length,
    0,
  );
});
