import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  loadPianoBenchmark,
  scorePianoBenchmarkCase,
  type PianoBenchmarkCase,
} from "../../test-fixtures/piano-benchmark";
import {
  planPianoPhrase,
  unsupportedPianoHand,
  assemblePianoPhrase,
  type PianoPhrasePlan,
} from "../../src/piano-phrase-fingering";
import {
  rawNeuralPlan,
  constrainedNeuralPlan,
  neuralPhysicalViolations,
  neuralContacts,
} from "../../test-fixtures/piano-neural-comparison";
import { chiralityCandidateHands } from "../../test-fixtures/piano-chirality-comparison";
const [requestPath, predictionPath, manifestPath, output] =
  process.argv.slice(2);
if (
  !requestPath ||
  !predictionPath ||
  !manifestPath ||
  !output ||
  existsSync(output)
)
  throw Error(
    "Specify requests, predictions, artifact manifest and a new report",
  );
const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const requestBytes = readFileSync(requestPath),
  predictionBytes = readFileSync(predictionPath),
  manifestBytes = readFileSync(manifestPath);
const requests = JSON.parse(requestBytes.toString()),
  predictions = JSON.parse(predictionBytes.toString()),
  manifest = JSON.parse(manifestBytes.toString());
assert.equal(predictions.requestSha256, hash(requestBytes));
assert.equal(predictions.weightsSha256, manifest.weights.sha256);
for (const [file, digest] of Object.entries(manifest.sourceSha256))
  assert.equal(predictions.upstreamSourceSha256[file], digest);
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
      family: source + ":" + c.family,
      scope: "old",
      unsupportedNotation: false,
    })),
  ),
  ...fresh.cases.map((c: PianoBenchmarkCase) => ({
    ...c,
    scope: "czerny",
    unsupportedNotation: fresh.inventory.find((x: any) => x.id === c.id)
      .unsupportedNotation,
  })),
];
assert.deepEqual(
  requests.cases.map((c: any) => c.id),
  cases.map((c) => c.id),
);
assert.deepEqual(
  predictions.cases.map((c: any) => c.id),
  cases.map((c) => c.id),
);
const rows: any[] = [];
for (const [i, c] of cases.entries()) {
  const request = requests.cases[i],
    prediction = predictions.cases[i];
  assert.equal(request.notesSha256, hash(JSON.stringify(c.notes)));
  assert.equal(prediction.notesSha256, request.notesSha256);
  assert.equal(request.unsupportedNotation, c.unsupportedNotation);
  for (const hand of ["right", "left"] as const)
    assert.deepEqual(
      request.hands[hand],
      neuralContacts(c.notes)
        .filter((n) => n.hand === hand)
        .map((n) => ({ id: n.id, midi: n.midi })),
    );
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
  const t = performance.now(),
    classic = c.unsupportedNotation
      ? empty()
      : planPianoPhrase(c.notes, { bpm: c.bpm }),
    classicMs = performance.now() - t;
  const plans: Record<string, PianoPhrasePlan> = { classic },
    costs: Record<string, number> = { classic: classicMs };
  let selected: Record<string, number | null> = { right: null, left: null };
  if (c.unsupportedNotation)
    for (const mode of ["uniform", "published", "safe-published"])
      plans[mode] = empty();
  else {
    for (const mode of ["uniform", "published"] as const) {
      const hands = chiralityCandidateHands(c.notes, prediction.hands, mode);
      plans[mode] = rawNeuralPlan(c.notes, hands, c.bpm);
      costs[mode] = Object.values(hands).reduce((s, h) => s + h!.elapsedMs, 0);
      if (mode === "published") {
        const start = performance.now(),
          constrained = constrainedNeuralPlan(c.notes, hands, c.bpm);
        plans["safe-published"] = constrained.plan;
        selected = constrained.selected;
        costs["safe-published"] = costs[mode] + performance.now() - start;
      }
    }
  }
  const outcomes: any = {};
  for (const [mode, plan] of Object.entries(plans)) {
    const digits = new Map(plan.notes.map((n) => [n.id, n.finger]));
    const score = scorePianoBenchmarkCase(c, plan),
      { mismatches, ...counts } = score;
    const physical = neuralPhysicalViolations(c.notes, digits);
    const fixed =
      (mode === "uniform" || mode === "published") && !c.unsupportedNotation
        ? planPianoPhrase(
            c.notes.map((n) => ({ ...n, finger: digits.get(n.id) })),
            { bpm: c.bpm },
          )
        : plan;
    const conflicts = Object.fromEntries(
      [...new Set(physical.map((v) => v.code))].map((code) => [
        code,
        physical.filter((v) => v.code === code).length,
      ]),
    );
    if (mode === "safe-published") {
      assert.equal(physical.length, 0);
      assert.deepEqual(
        Object.values(plan.hands).map((h) => h.status),
        Object.values(classic.hands).map((h) => h.status),
      );
    }
    outcomes[mode] = {
      ...counts,
      fingers: c.notes.map((n) => digits.get(n.id) ?? 0).join(""),
      feasibleHands: Object.values(fixed.hands).filter(
        (h) => h.status === "complete",
      ).length,
      feasibilityDiagnostics: Object.values(fixed.hands).flatMap((h) =>
        h.diagnostic ? [h.diagnostic] : [],
      ),
      physicalConflicts: physical.length,
      conflicts,
      elapsedMs: costs[mode] ?? 0,
      nativeGateViolations:
        mode === "classic"
          ? null
          : Object.entries(prediction.hands).reduce(
              (s, [hand, h]: [string, any]) =>
                s +
                (mode === "safe-published" && selected[hand] === null
                  ? 0
                  : h.predictions[
                      mode === "safe-published" ? "published" : mode
                    ].nativeGateViolations),
              0,
            ),
    };
  }
  rows.push({
    id: c.id,
    scope: c.scope,
    family: c.family,
    evidence: c.evidence ?? "printed",
    unsupportedNotation: c.unsupportedNotation,
    selected,
    outcomes,
  });
}
function summarize(rs: typeof rows, mode: string) {
  const sum = (k: string) =>
      rs.reduce((s, r) => s + (r.outcomes[mode][k] ?? 0), 0),
    eligible = sum("eligible"),
    matches = sum("matches"),
    covered = sum("covered");
  return {
    cases: rs.length,
    eligible,
    matches,
    agreement: eligible ? matches / eligible : null,
    covered,
    coverage: eligible ? covered / eligible : null,
    predictedNotes: sum("predictedNotes"),
    totalNotes: sum("totalNotes"),
    feasibleHands: sum("feasibleHands"),
    totalHands: rs.length * 2,
    physicalConflicts: sum("physicalConflicts"),
    nativeGateViolations:
      mode === "classic" ? null : sum("nativeGateViolations"),
    sequence: Object.fromEntries(
      [
        "eligibleCases",
        "completeCases",
        "eligibleHands",
        "completeHands",
        "eligibleTransitions",
        "matchedTransitions",
      ].map((k) => [
        k,
        rs.reduce((s, r) => s + r.outcomes[mode].sequence[k], 0),
      ]),
    ),
    nativeAcceptedHands:
      mode === "safe-published"
        ? rs.reduce(
            (s, r) =>
              s + Object.values(r.selected).filter((x) => x !== null).length,
            0,
          )
        : null,
    timing: {
      totalMs: sum("elapsedMs"),
      maxMs: Math.max(0, ...rs.map((r) => r.outcomes[mode].elapsedMs)),
    },
  };
}
const compare = (rs: typeof rows) =>
  Object.fromEntries(
    ["classic", "uniform", "published", "safe-published"].map((mode) => [
      mode,
      summarize(rs, mode),
    ]),
  );
const paired = (rs: typeof rows, mode: string) => ({
  improved: rs.filter(
    (r) => r.outcomes[mode].matches > r.outcomes.classic.matches,
  ).length,
  regressed: rs.filter(
    (r) => r.outcomes[mode].matches < r.outcomes.classic.matches,
  ).length,
  unchanged: rs.filter(
    (r) => r.outcomes[mode].matches === r.outcomes.classic.matches,
  ).length,
  differences: rs.map((r) => ({
    id: r.id,
    eligible: r.outcomes.classic.eligible,
    delta: r.outcomes[mode].matches - r.outcomes.classic.matches,
  })),
});
const report = {
  schema: 1,
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  scope: requests.scope,
  semantics:
    "Unmodified pinned native Parncutt feature/Viterbi modules; native uniform and published weights use the identical flattened contact sequences (ascending pitch at a simultaneous onset, merged ties/unisons). No durations, held contacts, rests or source labels enter native inference. Raw coverage/complete status is an identity-scoring adapter only: feasibility comes from fixed-input planning and independent conflict checks. Safe-published accepts an entire native hand only when our fixed-input planner supports it, otherwise keeps classic. No label-guided selection. Three Czerny grace pieces remain unsupported for every method and in denominators. Published weights and AGPL modules remain ignored offline artifacts; no product integration.",
  hashes: {
    requests: hash(requestBytes),
    predictions: hash(predictionBytes),
    artifacts: hash(manifestBytes),
    evaluator: hash(
      readFileSync(new URL("./chirality-evaluate.ts", import.meta.url)),
    ),
  },
  validation: predictions.validation,
  versions: predictions.versions,
  nativeInferenceElapsedMs: predictions.elapsedMs,
  czerny: compare(rows.filter((r) => r.scope === "czerny")),
  oldPrinted: compare(
    rows.filter((r) => r.scope === "old" && r.evidence === "printed"),
  ),
  oldCompleted: compare(
    rows.filter((r) => r.scope === "old" && r.evidence === "completed"),
  ),
  families: Object.fromEntries(
    [...new Set(rows.map((r) => r.family))].map((f) => [
      f,
      compare(rows.filter((r) => r.family === f)),
    ]),
  ),
  pairedCzerny: Object.fromEntries(
    ["uniform", "published", "safe-published"].map((mode) => [
      mode,
      paired(
        rows.filter((r) => r.scope === "czerny"),
        mode,
      ),
    ]),
  ),
  rows,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      czerny: report.czerny,
      oldPrinted: report.oldPrinted,
      oldCompleted: report.oldCompleted,
    },
    null,
    2,
  ),
);
