import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
} from "../../src/piano-phrase-fingering";
import {
  rankPianoPhrase,
  initialRankingWeights,
  type RankingMode,
} from "../../test-fixtures/piano-structured-ranking";
import { neuralPhysicalViolations } from "../../test-fixtures/piano-neural-comparison";

const [weightsPath, corpusPath, output] = process.argv.slice(2);
if (!weightsPath || !corpusPath || !output || existsSync(output))
  throw Error("Specify frozen weights, imported corpus and a new report path");
const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const weightsBytes = readFileSync(weightsPath),
  artifacts = JSON.parse(weightsBytes.toString());
const protocol = readFileSync(
  new URL("./structured-protocol.json", import.meta.url),
);
assert.equal(artifacts.protocolSha256, hash(protocol));
for (const [file, digest] of Object.entries(artifacts.hashes))
  assert.equal(
    hash(readFileSync(new URL(file, import.meta.url))),
    digest,
    "Training source drift: " + file,
  );
const corpusBytes = readFileSync(corpusPath),
  fresh = JSON.parse(corpusBytes.toString());
const reservationBytes = readFileSync(
  new URL(
    "../../test-fixtures/external/mutopia-czerny/reservation.json",
    import.meta.url,
  ),
);
assert.equal(fresh.reservationSha256, hash(reservationBytes));
const reservation = JSON.parse(reservationBytes.toString());
assert.deepEqual(
  fresh.cases.map((c: PianoBenchmarkCase) => c.id),
  reservation.files.map((f: { file: string }) => f.file.replace(/\.ly$/, "")),
);
for (const entry of reservation.files)
  assert.equal(
    hash(
      readFileSync(
        new URL(
          "../../test-fixtures/external/mutopia-czerny/" + entry.file,
          import.meta.url,
        ),
      ),
    ),
    entry.sha256,
  );
const old = (["hanon", "beringer", "beringer-scales"] as const).flatMap(
  (source) =>
    loadPianoBenchmark(source).map((c) => ({
      ...c,
      id: source + ":" + c.id,
      family: source + ":" + c.family,
    })),
);
assert.ok(
  !fresh.cases.some((c: PianoBenchmarkCase) =>
    artifacts.trainingIds.includes(c.id),
  ),
);
const rows: any[] = [],
  timings: Record<string, number[]> = {};
for (const [scope, cases] of [
  ["fresh", fresh.cases],
  ["old", old],
] as [string, PianoBenchmarkCase[]][])
  for (const c of cases) {
    const metadata =
      scope === "fresh"
        ? fresh.inventory.find((r: any) => r.id === c.id)
        : undefined;
    const outcomes: any = {};
    for (const mode of ["classic", "scalar", "structured"] as const) {
      const t = performance.now();
      const plan = metadata?.unsupportedNotation
        ? assemblePianoPhrase(
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
          )
        : mode === "classic"
          ? planPianoPhrase(c.notes, { bpm: c.bpm })
          : rankPianoPhrase(
              c.notes,
              artifacts.learners[mode].weights,
              mode as RankingMode,
              { bpm: c.bpm },
            );
      const elapsedMs = performance.now() - t;
      (timings[scope + ":" + mode] ??= []).push(elapsedMs);
      const scored = scorePianoBenchmarkCase(c, plan);
      const violations = neuralPhysicalViolations(
        c.notes,
        new Map(plan.notes.map((n) => [n.id, n.finger])),
      );
      assert.equal(
        violations.length,
        0,
        "Independent physical conflict: " + c.id + ":" + mode,
      );
      if (!metadata?.unsupportedNotation) {
        const zero = rankPianoPhrase(
          c.notes,
          initialRankingWeights(),
          "structured",
          { bpm: c.bpm },
        );
        const classic =
          mode === "classic" ? plan : planPianoPhrase(c.notes, { bpm: c.bpm });
        assert.deepEqual(zero, classic, "Zero-weight compatibility: " + c.id);
        assert.deepEqual(
          Object.values(plan.hands).map((h) => h.status),
          Object.values(classic.hands).map((h) => h.status),
          "Coverage drift: " + c.id,
        );
      }
      const { mismatches, ...counts } = scored;
      const digits = new Map(plan.notes.map((n) => [n.id, n.finger]));
      outcomes[mode] = {
        ...counts,
        feasibleHands: Object.values(plan.hands).filter(
          (h) => h.status === "complete",
        ).length,
        physicalConflicts: violations.length,
        elapsedMs,
        physicalCost: plan.cost,
        // Fixed source note order, zero for unsupported. Reference IDs and
        // digits remain in the fingerprinted corpus; avoid triplicating them.
        fingers: c.notes.map((n) => digits.get(n.id) ?? 0).join(""),
        events: Object.values(plan.hands)
          .flatMap((h) => h.states.flatMap((s) => s.events))
          .reduce(
            (a: Record<string, number>, e) => ({
              ...a,
              [e.kind]: (a[e.kind] ?? 0) + 1,
            }),
            {},
          ),
      };
    }
    rows.push({
      scope,
      id: c.id,
      family: c.family,
      evidence: c.evidence ?? "printed",
      unsupportedNotation: !!metadata?.unsupportedNotation,
      outcomes,
    });
  }
function summary(rs: typeof rows, mode: string) {
  const sum = (k: string) =>
    rs.reduce((s, r) => s + (r.outcomes[mode][k] ?? 0), 0);
  const eligible = sum("eligible"),
    matches = sum("matches"),
    covered = sum("covered");
  const sequence = Object.fromEntries(
    [
      "eligibleCases",
      "completeCases",
      "eligibleHands",
      "completeHands",
      "eligibleTransitions",
      "matchedTransitions",
    ].map((k) => [k, rs.reduce((s, r) => s + r.outcomes[mode].sequence[k], 0)]),
  );
  return {
    cases: rs.length,
    eligible,
    matches,
    covered,
    agreement: eligible ? matches / eligible : null,
    agreementCovered: covered ? matches / covered : null,
    coverage: eligible ? covered / eligible : null,
    predictedNotes: sum("predictedNotes"),
    totalNotes: sum("totalNotes"),
    feasibleHands: sum("feasibleHands"),
    totalHands: rs.length * 2,
    physicalConflicts: sum("physicalConflicts"),
    physicalCost: sum("physicalCost"),
    sequence,
    events: Object.fromEntries(
      [
        "move",
        "thumb_under",
        "finger_over",
        "repeat_change",
        "substitution",
      ].map((k) => [
        k,
        rs.reduce((s, r) => s + (r.outcomes[mode].events[k] ?? 0), 0),
      ]),
    ),
  };
}
const compare = (rs: typeof rows) =>
  Object.fromEntries(
    ["classic", "scalar", "structured"].map((mode) => [
      mode,
      summary(rs, mode),
    ]),
  );
function paired(rs: typeof rows, mode: string) {
  const differences = rs.map((r) => ({
    id: r.id,
    eligible: r.outcomes.classic.eligible,
    delta: r.outcomes[mode].matches - r.outcomes.classic.matches,
  }));
  let seed = 20261126;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const samples = Array.from({ length: 10000 }, () => {
    let e = 0,
      d = 0;
    for (let i = 0; i < differences.length; i++) {
      const r = differences[Math.floor(rand() * differences.length)];
      e += r.eligible;
      d += r.delta;
    }
    return e ? d / e : 0;
  }).sort((a, b) => a - b);
  return {
    improved: differences.filter((r) => r.delta > 0).length,
    regressed: differences.filter((r) => r.delta < 0).length,
    unchanged: differences.filter((r) => !r.delta).length,
    wholePieceBootstrap95: [samples[250], samples[9750]],
    differences,
  };
}
const final = {
  schema: 1,
  study: artifacts.study,
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  hashes: {
    weights: hash(weightsBytes),
    corpus: hash(corpusBytes),
    reservation: hash(reservationBytes),
    protocol: hash(protocol),
    evaluator: hash(
      readFileSync(new URL("./structured-evaluate.ts", import.meta.url)),
    ),
  },
  semantics:
    "All 19 pre-reserved pieces retained. Three ornament-containing pieces receive unsupported_notation for every model: no invented grace-note timing and no removal from denominators. Ambiguous chord-level/compound digits flagged, never gold. Old printed data are training performance, not held-out evidence. Completed labels are secondary previously consumed evidence. Physical costs are the unchanged classic costs of the selected path, not learned scores. Agreement is editorial agreement, not a proof of uniquely correct fingering.",
  fresh: compare(rows.filter((r) => r.scope === "fresh")),
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
  pairedFresh: Object.fromEntries(
    ["scalar", "structured"].map((mode) => [
      mode,
      paired(
        rows.filter((r) => r.scope === "fresh"),
        mode,
      ),
    ]),
  ),
  timings: Object.fromEntries(
    Object.entries(timings).map(([k, v]) => {
      const s = [...v].sort((a, b) => a - b);
      return [
        k,
        {
          totalMs: v.reduce((s, x) => s + x, 0),
          medianMs: s[Math.floor(s.length / 2)],
          p95Ms: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
          maxMs: s.at(-1),
        },
      ];
    }),
  ),
  importInventory: fresh.inventory.map(({ raw, ...rest }: any) => rest),
  rows,
};
writeFileSync(output, JSON.stringify(final, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      fresh: final.fresh,
      oldPrinted: final.oldPrinted,
      oldCompleted: final.oldCompleted,
      pairedFresh: final.pairedFresh,
      timings: final.timings,
    },
    null,
    2,
  ),
);
