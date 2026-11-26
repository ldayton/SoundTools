import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  loadPianoBenchmark,
  scorePianoBenchmarkCase,
  type PianoBenchmarkCase,
} from "../../test-fixtures/piano-benchmark";
import {
  planPianoPhrase,
  assemblePianoPhrase,
  unsupportedPianoHand,
} from "../../src/piano-phrase-fingering";
import {
  planUnifiedPianoPhrase,
  unifiedPianoPolicyVersion,
} from "../../research/chirality/unified";
import { neuralPhysicalViolations } from "../../test-fixtures/piano-neural-comparison";
const [freshPath, weightsPath, output] = process.argv.slice(2);
if (!freshPath || !weightsPath || !output || existsSync(output))
  throw Error("Specify reserved fresh corpus, weights and new report");
const hash = (b: string | Buffer) =>
    createHash("sha256").update(b).digest("hex"),
  freshBytes = readFileSync(freshPath),
  fresh = JSON.parse(freshBytes.toString()),
  weightsBytes = readFileSync(weightsPath),
  weights = JSON.parse(weightsBytes.toString());
const reservationBytes = readFileSync(
  new URL(
    "../../test-fixtures/external/mutopia-burgmuller/reservation.json",
    import.meta.url,
  ),
);
assert.equal(fresh.reservationSha256, hash(reservationBytes));
const reservation = JSON.parse(reservationBytes.toString());
assert.deepEqual(
  fresh.cases.map((c: any) => c.id),
  reservation.files.map((f: any) => f.file.replace(/\.ly$/, "")),
);
for (const entry of reservation.files)
  assert.equal(
    hash(
      readFileSync(
        new URL(
          "../../test-fixtures/external/mutopia-burgmuller/" + entry.file,
          import.meta.url,
        ),
      ),
    ),
    entry.sha256,
  );
const cases: (PianoBenchmarkCase & { scope: string; unsupported: boolean })[] =
  [
    ...(["hanon", "beringer", "beringer-scales"] as const).flatMap((source) =>
      loadPianoBenchmark(source).map((c) => ({
        ...c,
        id: source + ":" + c.id,
        family: source + ":" + c.family,
        scope: "old",
        unsupported: false,
      })),
    ),
    ...fresh.cases.map((c: PianoBenchmarkCase) => ({
      ...c,
      scope: "fresh",
      unsupported: fresh.inventory.find((r: any) => r.id === c.id)
        .unsupportedNotation,
    })),
  ];
const rows: any[] = [];
for (const c of cases) {
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
    candidate = c.unsupported
      ? {
          plan: empty(),
          decisions: {
            right: "unsupported-notation",
            left: "unsupported-notation",
          },
          contexts: [],
        }
      : planUnifiedPianoPhrase(c.notes, weights, { bpm: c.bpm }),
    elapsedMs = performance.now() - t;
  const classic = c.unsupported
    ? empty()
    : planPianoPhrase(c.notes, { bpm: c.bpm });
  const outcomes = Object.fromEntries(
    Object.entries({ classic, unified: candidate.plan }).map(([mode, p]) => {
      const s = scorePianoBenchmarkCase(c, p),
        { mismatches, ...counts } = s,
        digits = new Map(p.notes.map((n) => [n.id, n.finger])),
        conflicts = neuralPhysicalViolations(c.notes, digits);
      assert.equal(conflicts.length, 0, c.id + ":" + mode);
      return [
        mode,
        {
          ...counts,
          physicalConflicts: conflicts.length,
          fingers: c.notes.map((n) => digits.get(n.id) ?? 0).join(""),
          feasibleHands: Object.values(p.hands).filter(
            (h) => h.status === "complete",
          ).length,
          statistics: Object.fromEntries(
            Object.entries(p.hands).map(([hand, p]) => [hand, p.statistics]),
          ),
        },
      ];
    }),
  );
  rows.push({
    id: c.id,
    family: c.family,
    evidence: c.evidence ?? "printed",
    scope: c.scope,
    unsupportedNotation: c.unsupported,
    elapsedMs,
    decisions: candidate.decisions,
    outcomes,
  });
}
function summarize(rs: typeof rows, mode: string) {
  const sum = (k: string) =>
    rs.reduce((s, r) => s + (r.outcomes[mode][k] ?? 0), 0);
  return {
    cases: rs.length,
    eligible: sum("eligible"),
    matches: sum("matches"),
    covered: sum("covered"),
    agreement: sum("matches") / sum("eligible"),
    feasibleHands: sum("feasibleHands"),
    physicalConflicts: sum("physicalConflicts"),
    sequence: Object.fromEntries(
      ["completeCases", "completeHands", "matchedTransitions"].map((k) => [
        k,
        rs.reduce((s, r) => s + r.outcomes[mode].sequence[k], 0),
      ]),
    ),
  };
}
const compare = (rs: typeof rows) =>
  Object.fromEntries(["classic", "unified"].map((m) => [m, summarize(rs, m)]));
const printed = compare(
    rows.filter((r) => r.scope === "old" && r.evidence === "printed"),
  ),
  freshResult = compare(rows.filter((r) => r.scope === "fresh")),
  families: Record<string, ReturnType<typeof compare>> = Object.fromEntries(
    [
      ...new Set(rows.filter((r) => r.scope === "old").map((r) => r.family)),
    ].map((f) => [f, compare(rows.filter((r) => r.family === f))]),
  );
const gates = [
  {
    name: "printed-total",
    pass: printed.unified.matches >= printed.classic.matches,
  },
  {
    name: "fresh-total",
    pass: freshResult.unified.matches >= freshResult.classic.matches,
  },
  ...Object.entries(families).map(([family, s]) => ({
    name: "family:" + family,
    pass: s.unified.matches >= s.classic.matches,
  })),
  ...[printed, freshResult].flatMap((s, i) => [
    ...Object.keys(s.classic.sequence).map((k) => ({
      name: (i ? "fresh" : "printed") + ":" + k,
      pass: s.unified.sequence[k] >= s.classic.sequence[k],
    })),
    {
      name: (i ? "fresh" : "printed") + ":coverage",
      pass: s.unified.covered >= s.classic.covered,
    },
  ]),
];
const files = [
  "../../research/chirality/unified.ts",
  "../../research/chirality/rules.ts",
  "../../src/piano-phrase-fingering.ts",
  "./unified-protocol.json",
  "./unified-v2-protocol.json",
  "./unified-evaluate.ts",
];
const result = {
  schema: 1,
  policy: unifiedPianoPolicyVersion,
  scope:
    "Frozen policy, fresh eighteen-piece reservation and consumed regression groups. No fitting or fresh-result tuning. Five ornament/cross-staff pieces retained unsupported for both methods. Upstream PIG training overlap cannot be certified.",
  hashes: {
    fresh: hash(freshBytes),
    reservation: hash(reservationBytes),
    weights: hash(weightsBytes),
    implementation: Object.fromEntries(
      files.map((f) => [f, hash(readFileSync(new URL(f, import.meta.url)))]),
    ),
  },
  promotion: { passed: gates.every((g) => g.pass), gates },
  printed,
  completed: compare(
    rows.filter((r) => r.scope === "old" && r.evidence === "completed"),
  ),
  fresh: freshResult,
  families,
  totalMs: rows.reduce((s, r) => s + r.elapsedMs, 0),
  importInventory: fresh.inventory.map(({ events, ...rest }: any) => rest),
  rows,
};
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    { ...result, rows: undefined, importInventory: undefined },
    null,
    2,
  ),
);
