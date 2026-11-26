import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  loadPianoBenchmark,
  scorePianoBenchmarkCase,
} from "../../test-fixtures/piano-benchmark";
import {
  hybridNeuralPlan,
  hybridCandidateSet,
  hybridAcceptance,
  type HybridHands,
  type HybridMetrics,
} from "../../test-fixtures/piano-hybrid-ranking";
import {
  constrainedNeuralPlan,
  neuralPhysicalViolations,
  type NeuralHands,
} from "../../test-fixtures/piano-neural-comparison";
import {
  planPianoPhrase,
  type PianoPhrasePlan,
} from "../../src/piano-phrase-fingering";
const input = process.argv[2],
  directory = process.argv[3],
  output = process.argv[4];
if (!input || !directory || !output)
  throw Error("Specify neural artifacts, hybrid directory and report output");
const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const protocol = JSON.parse(readFileSync(directory + "/protocol.json", "utf8")),
  requestBytes = readFileSync(directory + "/requests.json"),
  requests = JSON.parse(requestBytes.toString()),
  scoreBytes = readFileSync(directory + "/scores.json"),
  scored = JSON.parse(scoreBytes.toString()),
  predictionBytes = readFileSync(input + "/lumikey.json"),
  predictions = JSON.parse(predictionBytes.toString());
assert.equal(hash(JSON.stringify(protocol)), requests.protocolSha256);
assert.equal(hash(predictionBytes), requests.predictionSha256);
assert.equal(hash(requestBytes), scored.requestSha256);
assert.equal(protocol.study, scored.study);
assert.equal(scored.model, "lumikey");
assert.deepEqual(
  protocol,
  JSON.parse(
    readFileSync(new URL("./hybrid-protocol.json", import.meta.url), "utf8"),
  ),
);
const artifacts = JSON.parse(
  readFileSync(new URL("./artifacts.json", import.meta.url), "utf8"),
);
for (const hand of ["left", "right"])
  assert.equal(
    scored.weightHashes[hand],
    artifacts.find(
      (a: any) =>
        a.model === "lumikey" &&
        a.path === `checkpoints/fingering_transformer_${hand}.pt`,
    ).sha256,
  );
const cases = (["hanon", "beringer", "beringer-scales"] as const).flatMap(
  (source) =>
    loadPianoBenchmark(source).map((c) => ({
      ...c,
      id: source + ":" + c.id,
      family: source + ":" + c.family,
    })),
);
const ids = cases.map((c) => c.id);
for (const rows of [requests.cases, scored.cases, predictions.cases])
  assert.deepEqual(
    rows.map((c: any) => c.id),
    ids,
  );
const timings: Record<string, number[]> = {},
  rows: any[] = [],
  audits: any[] = [];
function measure<T>(mode: string, run: () => T): T {
  const t = performance.now(),
    r = run();
  (timings[mode] ??= []).push(performance.now() - t);
  return r;
}
for (const [index, c] of cases.entries()) {
  const request = requests.cases[index],
    inference = scored.cases[index],
    neural = predictions.cases[index].hands as NeuralHands;
  assert.equal(request.notesSha256, hash(JSON.stringify(c.notes)));
  assert.deepEqual(
    JSON.parse(JSON.stringify(hybridCandidateSet(c.notes, neural, c.bpm))),
    request.hands,
  );
  const heads = inference.hands as HybridHands;
  assert.deepEqual(Object.keys(heads), Object.keys(request.hands));
  for (const hand of ["left", "right"] as const)
    if (heads[hand]) {
      assert.deepEqual(heads[hand]!.contacts, request.hands[hand].contacts);
      assert.deepEqual(
        heads[hand]!.candidates.map(({ logProbability, ...rest }) => rest),
        request.hands[hand].candidates.map(
          ({ logProbability, ...rest }: any) => rest,
        ),
      );
    }
  const classic = measure("classic", () =>
    planPianoPhrase(c.notes, { bpm: c.bpm }),
  );
  const constrained = measure("first-feasible", () =>
    constrainedNeuralPlan(c.notes, neural, c.bpm),
  );
  const hybrid = measure("hybrid", () =>
    hybridNeuralPlan(c.notes, heads, c.bpm, protocol.physicalCostWeight),
  );
  audits.push({ id: c.id, decisions: hybrid.decisions });
  for (const [mode, plan] of [
    ["classic", classic],
    ["first-feasible", constrained.plan],
    ["hybrid", hybrid.plan],
  ] as const) {
    const score = scorePianoBenchmarkCase(c, plan),
      digits = new Map(plan.notes.map((n) => [n.id, n.finger]));
    const violations = neuralPhysicalViolations(c.notes, digits),
      populated = (["left", "right"] as const).filter((h) =>
        c.notes.some((n) => n.hand === h),
      );
    for (const n of plan.notes) {
      const source = c.notes.find((s) => s.id === n.id)!;
      if (source.finger !== undefined) assert.equal(n.finger, source.finger);
      assert.equal(n.tieFrom, source.tieFrom);
      assert.equal(n.voice, source.voice);
      assert.equal(n.phraseStart, source.phraseStart);
      assert.equal(n.notatedDuration, source.notatedDuration);
    }
    const selected =
      mode === "hybrid"
        ? Object.fromEntries(
            Object.entries(hybrid.decisions).map(([h, d]) => [h, d!.selected]),
          )
        : undefined;
    rows.push({
      mode,
      id: c.id,
      family: c.family,
      partition: c.partition,
      evidence: c.evidence ?? "printed",
      totalNotes: score.totalNotes,
      predictedNotes: score.predictedNotes,
      eligible: score.eligible,
      covered: score.covered,
      matches: score.matches,
      sequence: score.sequence,
      populatedHands: populated.length,
      feasibleHands: populated.filter(
        (h) => plan.hands[h].status === "complete",
      ).length,
      basicViolations: violations.length,
      physicalCost: plan.cost,
      movementCost: plan.costs.movement,
      events: planEventCounts(plan),
      selected,
    });
  }
  if (index % 40 === 0) console.log("Evaluated", index + 1, "/", cases.length);
}
function planEventCounts(plan: PianoPhrasePlan) {
  const events = Object.values(plan.hands).flatMap((h) =>
    h.states.flatMap((s) => s.events),
  );
  return {
    shifts: events.filter((e) => e.kind === "move").length,
    crossings: events.filter(
      (e) => e.kind === "thumb_under" || e.kind === "finger_over",
    ).length,
    repeatChanges: events.filter((e) => e.kind === "repeat_change").length,
  };
}
function summarize(rs: typeof rows) {
  const sum = (key: string) => rs.reduce((s, r) => s + r[key], 0),
    sequence = Object.fromEntries(
      [
        "eligibleCases",
        "completeCases",
        "eligibleHands",
        "completeHands",
        "eligibleTransitions",
        "matchedTransitions",
      ].map((k) => [k, rs.reduce((s, r) => s + r.sequence[k], 0)]),
    );
  return {
    cases: rs.length,
    totalNotes: sum("totalNotes"),
    predictedNotes: sum("predictedNotes"),
    eligible: sum("eligible"),
    covered: sum("covered"),
    matches: sum("matches"),
    agreement: sum("matches") / sum("eligible"),
    feasibleHands: sum("feasibleHands"),
    populatedHands: sum("populatedHands"),
    basicViolations: sum("basicViolations"),
    physicalCost: sum("physicalCost"),
    movementCost: sum("movementCost"),
    events: Object.fromEntries(
      ["shifts", "crossings", "repeatChanges"].map((k) => [
        k,
        rs.reduce((s, r) => s + r.events[k], 0),
      ]),
    ),
    sequence,
  };
}
const summaries = Object.fromEntries(
  ["classic", "first-feasible", "hybrid"].map((mode) => {
    const selected = rows.filter((r) => r.mode === mode);
    return [
      mode,
      {
        ...summarize(selected),
        families: Object.fromEntries(
          [...new Set(cases.map((c) => c.family))].map((f) => [
            f,
            summarize(selected.filter((r) => r.family === f)),
          ]),
        ),
        evidence: Object.fromEntries(
          ["printed", "completed"].map((e) => [
            e,
            summarize(selected.filter((r) => r.evidence === e)),
          ]),
        ),
        partitions: Object.fromEntries(
          ["development", "validation"].map((p) => [
            p,
            summarize(selected.filter((r) => r.partition === p)),
          ]),
        ),
      },
    ];
  }),
);
function metrics(s: (typeof summaries)[string]): HybridMetrics {
  return {
    matches: s.matches,
    printedMatches: s.evidence.printed.matches,
    covered: s.covered,
    feasibleHands: s.feasibleHands,
    basicViolations: s.basicViolations,
    completeCases: s.sequence.completeCases,
    completeHands: s.sequence.completeHands,
    matchedTransitions: s.sequence.matchedTransitions,
    familyMatches: Object.fromEntries(
      Object.entries(s.families).map(([k, v]) => [k, v.matches]),
    ),
  };
}
const gates = hybridAcceptance(
  metrics(summaries.classic),
  metrics(summaries.hybrid),
);
const decision = {
  automatedGatesPassed: gates.every((g) => g.passed),
  humanReviewRequired: false,
  productionChanged: false,
  gates,
};
const differences = cases.map((c) => {
  const rs = rows.filter((r) => r.id === c.id),
    b = rs.find((r) => r.mode === "classic")!,
    h = rs.find((r) => r.mode === "hybrid")!;
  return {
    id: c.id,
    family: c.family,
    matches: h.matches - b.matches,
    covered: h.covered - b.covered,
    physicalCost: h.physicalCost - b.physicalCost,
  };
});
function timing(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    totalMs: values.reduce((s, v) => s + v, 0),
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    maxMs: sorted.at(-1),
  };
}
const report = {
  schema: 1,
  study: protocol.study,
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  protocol,
  hashes: {
    requests: hash(requestBytes),
    scores: hash(scoreBytes),
    predictions: hash(predictionBytes),
    weights: scored.weightHashes,
    implementation: Object.fromEntries(
      [
        "../../test-fixtures/piano-hybrid-ranking.ts",
        "../../test-fixtures/piano-neural-comparison.ts",
        "./infer.py",
        "./score_hybrid.py",
        "./hybrid-prepare.ts",
        "./hybrid-evaluate.ts",
      ].map((path) => [
        path,
        hash(readFileSync(new URL(path, import.meta.url))),
      ]),
    ),
  },
  torch: scored.torch,
  timings: {
    planning: Object.fromEntries(
      Object.entries(timings).map(([k, v]) => [k, timing(v)]),
    ),
    sequenceScoring: {
      elapsedMs: scored.elapsedMs,
      ...timing(
        scored.cases.map((c: any) =>
          Object.values(c.hands).reduce(
            (s: number, h: any) => s + h.elapsedMs,
            0,
          ),
        ) as number[],
      ),
    },
    priorBeamGenerationMs: predictions.elapsedMs,
  },
  summaries,
  decision,
  differences,
  rows,
};
writeFileSync(
  directory + "/audit.json",
  JSON.stringify(audits, null, 2) + "\n",
);
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      summaries: Object.fromEntries(
        Object.entries(summaries).map(([k, v]) => [
          k,
          {
            agreement: v.agreement,
            matches: v.matches,
            printedMatches: v.evidence.printed.matches,
            completeCases: v.sequence.completeCases,
            feasibleHands: v.feasibleHands,
            basicViolations: v.basicViolations,
          },
        ]),
      ),
      decision,
    },
    null,
    2,
  ),
);
