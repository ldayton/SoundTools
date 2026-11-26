/** Full data-only quality/coverage regression, once per Nightly. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import original from "../../../docs/piano-benchmark-results.json";
import golden from "../../../docs/piano-ergonomics-results.json";
import oldLabels from "../../../packages/music-practice/test-fixtures/piano-benchmark-v1-labels.json";
import {
  loadPianoBenchmark,
  evaluatePianoBenchmark,
} from "../../../packages/music-practice/test-fixtures/piano-benchmark";
import { planPianoPhrase } from "../../../packages/music-practice/src/piano-phrase-fingering";
const ids = oldLabels as Record<string, string[]>;
const oldCorpus = loadPianoBenchmark().map((c) => ({
  ...c,
  labels: c.labels.map((l) =>
    l.kind === "printed" && !ids[c.id].includes(l.id)
      ? { ...l, kind: "flagged" as const }
      : l,
  ),
}));
function guard(
  actual: ReturnType<typeof evaluatePianoBenchmark>,
  expected: {
    summary: {
      cases: number;
      eligible: number;
      covered: number;
      predictedNotes: number;
    };
    families: Record<
      string,
      { eligible: number; cases: number; matches: number }
    >;
  },
  tag: string,
) {
  assert.equal(actual.summary.cases, expected.summary.cases, tag);
  assert.equal(actual.summary.eligible, expected.summary.eligible, tag);
  assert.ok(
    actual.summary.covered >= expected.summary.covered,
    tag + ": coverage loss",
  );
  assert.ok(
    actual.summary.predictedNotes >= expected.summary.predictedNotes,
    tag + ": missing notes",
  );
  for (const [family, target] of Object.entries(expected.families)) {
    const observed = actual.families[family];
    assert.ok(observed, tag + ": missing family");
    assert.equal(observed.eligible, target.eligible);
    assert.equal(observed.cases, target.cases);
    assert.ok(
      observed.matches >= target.matches,
      `${tag}:${family}: agreement regressed ${observed.matches}<${target.matches}`,
    );
  }
}
const results: Record<string, ReturnType<typeof evaluatePianoBenchmark>> = {};
for (const partition of ["development", "validation"] as const)
  results["original:" + partition] = evaluatePianoBenchmark(
    oldCorpus.filter((c) => c.partition === partition),
  );
for (const source of ["hanon", "beringer"] as const) {
  const filename =
    source === "hanon" ? "piano-benchmark.json" : "piano-beringer.json";
  assert.equal(
    createHash("sha256")
      .update(
        readFileSync(
          new URL(
            "../../../packages/music-practice/test-fixtures/" + filename,
            import.meta.url,
          ),
        ),
      )
      .digest("hex"),
    golden.corpora[source].sha256,
    "review changed source data",
  );
  for (const partition of ["development", "validation"] as const)
    for (const model of ["classic", "ergonomic"] as const)
      results[`${source}:${partition}:${model}`] = evaluatePianoBenchmark(
        loadPianoBenchmark(source).filter((c) => c.partition === partition),
        (ns, p) => planPianoPhrase(ns, { ...p, model }),
      );
}
const dir = new URL("../work/piano-benchmark/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(
  new URL("results.json", dir),
  JSON.stringify(results, null, 2) + "\n",
);
for (const partition of ["development", "validation"] as const) {
  guard(
    results["original:" + partition],
    original.partitions[partition].current,
    "original:" + partition,
  );
  for (const source of ["hanon", "beringer"] as const)
    for (const model of ["classic", "ergonomic"] as const)
      guard(
        results[`${source}:${partition}:${model}`],
        golden.corpora[source].partitions[partition][model],
        `${source}:${partition}:${model}`,
      );
}
console.log(
  "PASS: original production floors, expanded editorial corpus, and separate opt-in candidate/reference metrics; report " +
    new URL("results.json", dir).pathname,
);
