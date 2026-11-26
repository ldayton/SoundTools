import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadPianoBenchmark } from "../test-fixtures/piano-benchmark";
import {
  auditPianoCosts,
  summarizePianoCostAudit,
} from "../test-fixtures/piano-cost-audit";
const output = process.argv[2];
if (!output) throw Error("Specify output JSON path");
const started = performance.now(),
  sources = ["hanon", "beringer", "beringer-scales"] as const;
const rows = sources.flatMap((source) =>
  loadPianoBenchmark(source).flatMap((c) =>
    auditPianoCosts(c).map((hand) => ({
      source,
      id: source + ":" + c.id,
      family: source + ":" + c.family,
      partition: c.partition,
      totalNotes: c.notes.filter((n) => n.hand === hand.hand).length,
      ...hand,
    })),
  ),
);
const hash = (file: string) =>
  createHash("sha256")
    .update(readFileSync(new URL(file, import.meta.url)))
    .digest("hex");
const report = {
  schema: 1,
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  elapsedMs: performance.now() - started,
  scope:
    "All 262 consumed cases; classic production default. Printed and completed evidence stay separate. Unconstrained selection receives no reference labels; constrained passes are diagnostic only. No model is trained.",
  semantics: {
    feasible:
      "Full-source complete-hand feasibility with all relevant reference digits constrained; unannotated digits are optimized, never treated as gold",
    featureComparison:
      "A comparison of the selected completion with the minimum-default-cost reference-compatible completion. Dominance and equal features concern this pair, not every possible completion under other weights.",
    alternatives:
      "One whole reference alternative per counterfactual. Source-authored anchors are preserved; conflicting reference labels are diagnosed.",
  },
  hashes: Object.fromEntries(
    [
      "../test-fixtures/piano-benchmark.json",
      "../test-fixtures/piano-beringer.json",
      "../test-fixtures/piano-beringer-scales.json",
      "../test-fixtures/piano-cost-audit.ts",
      "../test-fixtures/piano-benchmark.ts",
      "../src/piano-phrase-fingering.ts",
      "../src/piano-hand-model.ts",
      "../src/piano-ergonomics.ts",
      "./audit-piano-costs.ts",
    ].map((path) => [path, hash(path)]),
  ),
  summary: summarizePianoCostAudit(rows),
  evidence: Object.fromEntries(
    ["printed", "completed"].map((kind) => [
      kind,
      summarizePianoCostAudit(rows.filter((r) => r.evidence === kind)),
    ]),
  ),
  families: Object.fromEntries(
    [...new Set(rows.map((r) => r.family))].map((family) => [
      family,
      summarizePianoCostAudit(rows.filter((r) => r.family === family)),
    ]),
  ),
  rows,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    { elapsedMs: report.elapsedMs, evidence: report.evidence },
    null,
    2,
  ),
);
