import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  loadPianoBenchmark,
  scorePianoBenchmarkCase,
} from "../../test-fixtures/piano-benchmark";
import {
  rawNeuralPlan,
  constrainedNeuralPlan,
  neuralPhysicalViolations,
  type NeuralHands,
} from "../../test-fixtures/piano-neural-comparison";
import {
  planPianoPhrase,
  type PianoPhrasePlan,
} from "../../src/piano-phrase-fingering";
const directory = process.argv[2],
  output = process.argv[3];
if (!directory || !output)
  throw Error("Specify artifact directory and output JSON");
const cases = (["hanon", "beringer", "beringer-scales"] as const).flatMap(
  (source) =>
    loadPianoBenchmark(source).map((c) => ({
      ...c,
      id: source + ":" + c.id,
      family: source + ":" + c.family,
    })),
);
const inputs = ["lumikey", "argnn", "arlstm", "argnn-pig", "arlstm-pig"].map(
  (name) => {
    const path = directory + "/" + name + ".json",
      bytes = readFileSync(path),
      data = JSON.parse(bytes.toString());
    if (
      data.model !== name.replace("-pig", "") ||
      data.beamWidth !== 6 ||
      data.cases.length !== cases.length ||
      (data.pitchShift ?? 0) !== (name.endsWith("-pig") ? -12 : 0)
    )
      throw Error("Incomplete model output or incorrect pitch convention");
    const byId = new Map<string, NeuralHands>(
      data.cases.map((c: { id: string; hands: NeuralHands }) => [
        c.id,
        c.hands,
      ]),
    );
    if (byId.size !== cases.length || cases.some((c) => !byId.has(c.id)))
      throw Error("Duplicate/missing inference cases");
    return {
      name,
      data,
      byId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  },
);
const rows: Record<string, unknown>[] = [],
  timings: Record<string, number[]> = {};
const measure = (name: string, fn: () => PianoPhrasePlan) => {
  const start = performance.now(),
    r = fn();
  (timings[name] ??= []).push(performance.now() - start);
  return r;
};
for (const [index, c] of cases.entries()) {
  const baseline = measure("classic", () =>
    planPianoPhrase(c.notes, { bpm: c.bpm }),
  );
  const modes: {
    name: string;
    plan: PianoPhrasePlan;
    selected?: Record<string, number | null>;
  }[] = [{ name: "classic", plan: baseline }];
  for (const model of inputs) {
    const predictions = model.byId.get(c.id)!;
    const greedy = Object.fromEntries(
      Object.entries(predictions).map(([hand, p]) => [
        hand,
        {
          ...p,
          candidates: [
            (p as typeof p & { greedy: (typeof p.candidates)[number] }).greedy,
          ],
        },
      ]),
    );
    modes.push({
      name: model.name + ":greedy",
      plan: rawNeuralPlan(c.notes, greedy, c.bpm),
    });
    modes.push({
      name: model.name + ":beam",
      plan: rawNeuralPlan(c.notes, predictions, c.bpm),
    });
    let constrained: ReturnType<typeof constrainedNeuralPlan>;
    const plan = measure(model.name + ":constrained", () => {
      constrained = constrainedNeuralPlan(c.notes, predictions, c.bpm);
      return constrained.plan;
    });
    modes.push({
      name: model.name + ":constrained",
      plan,
      selected: constrained!.selected,
    });
  }
  for (const mode of modes) {
    const score = scorePianoBenchmarkCase(c, mode.plan),
      digits = new Map(mode.plan.notes.map((n) => [n.id, n.finger]));
    const violations = neuralPhysicalViolations(c.notes, digits);
    const fixed =
      mode.name.includes(":") && !mode.selected
        ? planPianoPhrase(
            c.notes.map((n) => ({ ...n, finger: digits.get(n.id)! })),
            { bpm: c.bpm },
          )
        : mode.plan;
    const populated = (["left", "right"] as const).filter((h) =>
      c.notes.some((n) => n.hand === h),
    );
    const unsupported = populated.filter(
      (h) => fixed.hands[h].status !== "complete",
    );
    const neuralAccepted = mode.selected
      ? populated.filter((h) => mode.selected![h] !== null).length
      : undefined;
    rows.push({
      mode: mode.name,
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
      feasibleHands: populated.length - unsupported.length,
      unsupported: unsupported.map((h) => ({
        hand: h,
        diagnostic: fixed.hands[h].diagnostic,
      })),
      basicViolations: violations.length,
      violationTypes: violations.reduce(
        (s, v) => ({ ...s, [v.code]: (s[v.code] ?? 0) + 1 }),
        {} as Record<string, number>,
      ),
      neuralAccepted,
      fallbackHands: mode.selected
        ? populated.length - neuralAccepted!
        : undefined,
      selected: mode.selected,
    });
  }
  if (index % 40 === 0) console.log("Scored", index + 1, "/", cases.length);
}
const sum = (rs: typeof rows, key: string) =>
  rs.reduce((s, r) => s + Number(r[key] ?? 0), 0);
function summarize(rs: typeof rows) {
  const eligible = sum(rs, "eligible"),
    covered = sum(rs, "covered"),
    matches = sum(rs, "matches");
  return {
    cases: rs.length,
    totalNotes: sum(rs, "totalNotes"),
    predictedNotes: sum(rs, "predictedNotes"),
    eligible,
    covered,
    matches,
    agreement: matches / eligible,
    coverage: covered / eligible,
    populatedHands: sum(rs, "populatedHands"),
    feasibleHands: sum(rs, "feasibleHands"),
    casesWithBasicViolations: rs.filter((r) => Number(r.basicViolations) > 0)
      .length,
    basicViolations: sum(rs, "basicViolations"),
    neuralAccepted: sum(rs, "neuralAccepted"),
    fallbackHands: sum(rs, "fallbackHands"),
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
        rs.reduce((s, r) => s + (r.sequence as Record<string, number>)[k], 0),
      ]),
    ),
  };
}
const report = {
  schema: 1,
  baselineRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  corpusCases: cases.length,
  protocol: JSON.parse(readFileSync(directory + "/protocol.json", "utf8")),
  models: JSON.parse(
    readFileSync(directory + "/upstream/manifest.json", "utf8"),
  ),
  predictionHashes: Object.fromEntries(inputs.map((m) => [m.name, m.sha256])),
  inference: Object.fromEntries(
    inputs.map((m) => [
      m.name,
      { torch: m.data.torch, elapsedMs: m.data.elapsedMs },
    ]),
  ),
  timings: Object.fromEntries(
    Object.entries(timings).map(([k, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [
        k,
        {
          totalMs: values.reduce((a, b) => a + b, 0),
          medianMs: sorted[Math.floor(sorted.length / 2)],
          p95Ms: sorted[Math.floor(sorted.length * 0.95)],
          maxMs: sorted.at(-1),
        },
      ];
    }),
  ),
  summaries: Object.fromEntries(
    [...new Set(rows.map((r) => r.mode as string))].map((mode) => {
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
        },
      ];
    }),
  ),
  rows,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(report.summaries).map(([mode, v]) => [
        mode,
        {
          agreement: v.agreement,
          matches: v.matches,
          feasibleHands: v.feasibleHands,
          populatedHands: v.populatedHands,
          basicViolations: v.basicViolations,
          neuralAccepted: v.neuralAccepted,
          fallbackHands: v.fallbackHands,
        },
      ]),
    ),
    null,
    2,
  ),
);
