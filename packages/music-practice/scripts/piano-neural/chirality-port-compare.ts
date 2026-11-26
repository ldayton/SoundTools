/** Corpus parity is optional research; bounded synthetic parity remains in CI. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  decodeParncuttSequence,
  evaluateParncuttPath,
} from "../../research/chirality/decode";
import {
  parncuttRuleKeys,
  parncuttUniformWeights,
  type ParncuttWeights,
  type PianoDigit,
} from "../../research/chirality/rules";
import { planParncuttPhrase } from "../../research/chirality/constrained";
import {
  loadPianoBenchmark,
  scorePianoBenchmarkCase,
  type PianoBenchmarkCase,
} from "../../test-fixtures/piano-benchmark";
import {
  rawNeuralPlan,
  neuralPhysicalViolations,
  neuralContacts,
  type NeuralHands,
} from "../../test-fixtures/piano-neural-comparison";
import {
  planPianoPhrase,
  assemblePianoPhrase,
  unsupportedPianoHand,
  type PianoHand,
} from "../../src/piano-phrase-fingering";

const [requestPath, predictionPath, weightPath, output] = process.argv.slice(2);
if (!output || existsSync(output))
  throw Error(
    "Specify requests, pinned Python predictions, weights and a new report",
  );
const hash = (b: string | Buffer) =>
  createHash("sha256").update(b).digest("hex");
const requestBytes = readFileSync(requestPath),
  pythonBytes = readFileSync(predictionPath),
  weightBytes = readFileSync(weightPath);
const request = JSON.parse(requestBytes.toString()),
  python = JSON.parse(pythonBytes.toString()),
  published = JSON.parse(weightBytes.toString()) as ParncuttWeights;
assert.equal(python.requestSha256, hash(requestBytes));
assert.equal(python.weightsSha256, hash(weightBytes));
const fresh = JSON.parse(
  readFileSync(
    new URL("../../test-fixtures/piano-czerny.json", import.meta.url),
    "utf8",
  ),
);
const cases: (PianoBenchmarkCase & {
  scope: string;
  unsupportedNotation: boolean;
})[] = [
  ...(["hanon", "beringer", "beringer-scales"] as const).flatMap((source) =>
    loadPianoBenchmark(source).map((c) => ({
      ...c,
      id: source + ":" + c.id,
      scope: "old",
      unsupportedNotation: false,
    })),
  ),
  ...fresh.cases.map((c: PianoBenchmarkCase) => ({
    ...c,
    scope: "czerny",
    unsupportedNotation: fresh.inventory.find((r: any) => r.id === c.id)
      .unsupportedNotation,
  })),
];
assert.deepEqual(
  request.cases.map((c: any) => c.id),
  cases.map((c) => c.id),
);
assert.deepEqual(
  python.cases.map((c: any) => c.id),
  cases.map((c) => c.id),
);
const comparisons: any[] = [],
  rows: any[] = [],
  timings: number[] = [];
for (const [i, c] of cases.entries()) {
  assert.equal(request.cases[i].notesSha256, hash(JSON.stringify(c.notes)));
  const artifact = python.cases[i],
    predictions = {} as Record<string, NeuralHands>;
  if (!c.unsupportedNotation)
    for (const mode of ["uniform", "published"] as const) {
      const weights = mode === "uniform" ? parncuttUniformWeights : published,
        hands: NeuralHands = {};
      for (const hand of ["right", "left"] as const) {
        const contacts = neuralContacts(c.notes).filter((n) => n.hand === hand);
        if (!contacts.length) continue;
        const notes = contacts.map((n) => ({ id: n.id, midi: n.midi })),
          reference = artifact.hands[hand];
        assert.deepEqual(
          reference.contacts,
          notes.map((n) => n.id),
        );
        const t = performance.now(),
          result = decodeParncuttSequence(notes, hand, weights),
          elapsedMs = performance.now() - t;
        timings.push(elapsedMs);
        assert.equal(result.status, "complete");
        if (result.status !== "complete") continue;
        const expected = reference.predictions[mode],
          native = evaluateParncuttPath(notes, expected.fingers, hand, weights);
        assert.deepEqual(native.features, expected.ruleFeatures);
        assert.equal(native.gateViolations, expected.nativeGateViolations);
        // Every shipped reference coefficient has at most four decimal places.
        // Compare exact integer objective units to distinguish genuine errors from
        // different floating-point choices among mathematically tied paths.
        const units = (r: typeof native) =>
          parncuttRuleKeys.reduce((s, k) => {
            const w = Math.round(weights[k] * 10000);
            assert.ok(Math.abs(w / 10000 - weights[k]) < 1e-12);
            return s + r.features[k] * w;
          }, r.gateViolations * 1e12);
        const delta = units(result) - units(native);
        assert.equal(
          delta,
          0,
          JSON.stringify({
            id: c.id,
            hand,
            mode,
            delta,
            result: result.fingers,
            native: expected.fingers,
          }),
        );
        const identical = result.fingers.every(
          (f, j) => f === expected.fingers[j],
        );
        comparisons.push({
          id: c.id,
          hand,
          mode,
          notes: notes.length,
          classification: identical ? "identical" : "equal-objective-tie",
          deltaUnits: delta,
          elapsedMs,
          typescript: result.fingers.join(""),
          python: expected.fingers.join(""),
          cost: result.cost,
          gateViolations: result.gateViolations,
        });
        hands[hand] = {
          contacts: notes.map((n) => n.id),
          candidates: [{ fingers: result.fingers, logProbability: 0 }],
          elapsedMs,
        };
      }
      predictions[mode] = hands;
    }
  const empty = () =>
    assemblePianoPhrase(
      {
        right: unsupportedPianoHand({
          hand: "right",
          code: "unsupported_notation",
        }),
        left: unsupportedPianoHand({
          hand: "left",
          code: "unsupported_notation",
        }),
      },
      c.notes.map((n) => n.id),
    );
  const plans = c.unsupportedNotation
    ? { classic: empty(), published: empty(), safe: empty() }
    : {
        classic: planPianoPhrase(c.notes, { bpm: c.bpm }),
        published: rawNeuralPlan(c.notes, predictions.published, c.bpm),
        safe: planParncuttPhrase(c.notes, published, { bpm: c.bpm }).plan,
      };
  const outcomes = Object.fromEntries(
    Object.entries(plans).map(([mode, plan]) => {
      const { mismatches, ...score } = scorePianoBenchmarkCase(c, plan),
        conflicts = neuralPhysicalViolations(
          c.notes,
          new Map(plan.notes.map((n) => [n.id, n.finger])),
        );
      if (mode === "safe") assert.equal(conflicts.length, 0);
      return [
        mode,
        {
          ...score,
          physicalConflicts: conflicts.length,
          feasibleHands:
            mode === "published"
              ? null
              : Object.values(plan.hands).filter((h) => h.status === "complete")
                  .length,
        },
      ];
    }),
  );
  rows.push({
    id: c.id,
    scope: c.scope,
    evidence: c.evidence ?? "printed",
    outcomes,
  });
}
function summary(rs: typeof rows, mode: string) {
  const sum = (k: string) =>
    rs.reduce((s, r) => s + (r.outcomes[mode][k] ?? 0), 0);
  return {
    cases: rs.length,
    matches: sum("matches"),
    eligible: sum("eligible"),
    covered: sum("covered"),
    agreement: sum("matches") / sum("eligible"),
    physicalConflicts: sum("physicalConflicts"),
    feasibleHands: mode === "published" ? null : sum("feasibleHands"),
    sequence: Object.fromEntries(
      ["completeCases", "completeHands", "matchedTransitions"].map((k) => [
        k,
        rs.reduce((s, r) => s + r.outcomes[mode].sequence[k], 0),
      ]),
    ),
  };
}
const compare = (rs: typeof rows) =>
  Object.fromEntries(
    ["classic", "published", "safe"].map((mode) => [mode, summary(rs, mode)]),
  );
const implementation = [
  "../../research/chirality/rules.ts",
  "../../research/chirality/decode.ts",
  "../../research/chirality/constrained.ts",
  "./chirality-port-compare.ts",
];
const report = {
  schema: 1,
  scope:
    "TypeScript research port, no model fitting or product activation. All corpus hand/mode objectives compared in exact 1e-4 units; floating-point tied-path differences retained rather than masked. Three grace pieces retain prior unsupported policy.",
  hashes: {
    requests: hash(requestBytes),
    pythonPredictions: hash(pythonBytes),
    weights: hash(weightBytes),
    implementation: Object.fromEntries(
      implementation.map((p) => [
        p,
        hash(readFileSync(new URL(p, import.meta.url))),
      ]),
    ),
  },
  parity: {
    comparisons: comparisons.length,
    identical: comparisons.filter((r) => r.classification === "identical")
      .length,
    equalObjectiveTies: comparisons.filter(
      (r) => r.classification === "equal-objective-tie",
    ).length,
    costMismatches: comparisons.filter((r) => r.deltaUnits).length,
  },
  timings: {
    totalCoreMs: timings.reduce((s, x) => s + x, 0),
    maxHandMs: Math.max(...timings),
  },
  czerny: compare(rows.filter((r) => r.scope === "czerny")),
  oldPrinted: compare(
    rows.filter((r) => r.scope === "old" && r.evidence === "printed"),
  ),
  oldCompleted: compare(
    rows.filter((r) => r.scope === "old" && r.evidence === "completed"),
  ),
  comparisons,
  rows,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      parity: report.parity,
      timings: report.timings,
      czerny: report.czerny,
      oldPrinted: report.oldPrinted,
      oldCompleted: report.oldCompleted,
    },
    null,
    2,
  ),
);
