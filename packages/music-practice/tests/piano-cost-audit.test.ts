import test from "node:test";
import assert from "node:assert/strict";
import {
  auditPianoCosts,
  comparePianoCostFeatures,
  summarizePianoCostAudit,
} from "../test-fixtures/piano-cost-audit";
import {
  planPianoPhrase,
  type PianoPhraseCosts,
  type PianoPhrasePlan,
} from "../src/piano-phrase-fingering";
import type { PianoBenchmarkCase } from "../test-fixtures/piano-benchmark";
const zeros: PianoPhraseCosts = {
  posture: 0,
  movement: 0,
  repeat: 0,
  crossing: 0,
  substitution: 0,
  comfort: 0,
  context: 0,
  gesture: 0,
  preparation: 0,
};
const example = (): PianoBenchmarkCase => ({
  id: "synthetic",
  family: "test",
  source: "ours",
  partition: "development",
  bpm: 60,
  notes: [
    { id: "a", hand: "right", midi: 60, start: 0, duration: 1 },
    { id: "b", hand: "right", midi: 62, start: 1, duration: 1 },
  ],
  labels: [
    { id: "a", finger: 4, kind: "printed" },
    { id: "b", finger: 5, kind: "printed" },
  ],
});
function controlled(inferred: number, reference: number) {
  let first = true;
  return (
    notes: Parameters<typeof planPianoPhrase>[0],
    profile: Parameters<typeof planPianoPhrase>[1],
  ): PianoPhrasePlan => {
    const plan = planPianoPhrase(notes, profile),
      cost = first ? inferred : reference;
    first = false;
    plan.hands.right.costs = { ...zeros, movement: cost };
    plan.hands.right.cost = cost;
    return plan;
  };
}
test("cost audit separates preference, equal costs and lower constrained-path inconsistencies", () => {
  for (const [selected, reference, classification] of [
    [1, 3, "preference-disagreement"],
    [1, 1, "tied-optimum"],
    [3, 1, "search-inconsistency"],
  ] as const) {
    const result = auditPianoCosts(example(), controlled(selected, reference));
    assert.equal(result[1].classification, classification);
    assert.equal(result[1].costGap, reference - selected);
    assert.equal(result[1].mismatches, 2);
    assert.equal(result[0].classification, "no-reference");
  }
});
test("a rejected reference is distinct from unsupported unconstrained inference", () => {
  const conflict = example();
  conflict.notes[1].start = 0;
  conflict.labels = conflict.labels.map((l) => ({ ...l, finger: 1 }));
  assert.equal(
    auditPianoCosts(conflict)[1].classification,
    "reference-unrepresentable",
  );
  const unsupported = example();
  unsupported.notes.push({
    id: "left",
    hand: "left",
    midi: 60,
    start: 0,
    duration: 1,
  });
  assert.equal(
    auditPianoCosts(unsupported)[1].classification,
    "inference-unsupported",
  );
});
test("the audit preserves source anchors and diagnoses contradictory reference digits", () => {
  const c = example();
  c.notes[0].finger = 1;
  const before = JSON.stringify(c),
    calls: number[] = [];
  const result = auditPianoCosts(c, (notes, p) => {
    calls.push(notes[0].finger!);
    return planPianoPhrase(notes, p);
  });
  assert.deepEqual(calls, [1, 1]);
  assert.equal(JSON.stringify(c), before);
  assert.equal(result[1].classification, "reference-unrepresentable");
  assert.equal(
    result[1].diagnostics.references[0].code,
    "source-anchor-conflict",
  );
});
test("printed and completed annotations remain separate and unlabelled digits stay unlabelled", () => {
  const c = example();
  c.labels = [
    { id: "a", finger: 4, kind: "printed" },
    { id: "b", finger: 5, kind: "completed" },
  ];
  const calls: (number | undefined)[][] = [];
  const result = auditPianoCosts(c, (notes, p) => {
    calls.push(notes.map((n) => n.finger));
    return planPianoPhrase(notes, p);
  });
  assert.equal(result[1].eligible, 1);
  assert.deepEqual(calls, [
    [undefined, undefined],
    [4, undefined],
  ]);
  c.evidence = "completed";
  const completed = auditPianoCosts(c);
  assert.equal(completed[1].eligible, 1);
  assert.deepEqual(completed[1].mismatchedIds, ["b"]);
  const matched = example();
  matched.labels = [{ id: "a", finger: 1, kind: "printed" }];
  assert.equal(auditPianoCosts(matched)[1].classification, "matches-reference");
});
test("alternative references remain coherent sequences and cost analysis is distinct from match scoring", () => {
  const c = example();
  c.labels = [
    { id: "a", finger: 1, kind: "printed" },
    { id: "b", finger: 5, kind: "printed" },
  ];
  c.alternatives = [
    [
      { id: "a", finger: 4, kind: "printed" },
      { id: "b", finger: 2, kind: "printed" },
    ],
  ];
  const result = auditPianoCosts(c, controlled(1, 3));
  assert.equal(result[1].matches, 1);
  assert.equal(result[1].mismatches, 1);
  assert.equal(result[1].scoringReferenceIndex, 0);
});
test("feature comparisons identify tradeoffs, identical features and dominated completions", () => {
  assert.deepEqual(
    comparePianoCostFeatures(
      { ...zeros, movement: 2, posture: 1 },
      { ...zeros, movement: 1, posture: 3 },
    ).classification,
    "tradeoff",
  );
  assert.equal(
    comparePianoCostFeatures(zeros, { ...zeros, movement: 1 }).classification,
    "dominated-reference-completion",
  );
  assert.equal(
    comparePianoCostFeatures({ ...zeros, movement: 1 }, zeros).classification,
    "reference-dominates-selected",
  );
  assert.equal(
    comparePianoCostFeatures(zeros, { ...zeros, movement: 1e-9 })
      .classification,
    "indistinguishable-completions",
  );
  assert.throws(() =>
    comparePianoCostFeatures(zeros, { ...zeros, movement: NaN }),
  );
});
test("summary retains absent references, mismatches and unsupported hands in their respective denominators", () => {
  const rows = auditPianoCosts(example(), controlled(1, 3)),
    summary = summarizePianoCostAudit(rows);
  assert.equal(summary.hands, 2);
  assert.equal(summary.annotatedHands, 1);
  assert.equal(summary.disagreeingHands, 1);
  assert.equal(summary.eligible, 2);
  assert.equal(summary.mismatches, 2);
  assert.equal(summary.classifications["preference-disagreement"].hands, 1);
  assert.equal(
    summary.featureComparisons["dominated-reference-completion"].mismatches,
    2,
  );
});
