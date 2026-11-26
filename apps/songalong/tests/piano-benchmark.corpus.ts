/** Full data-only quality/coverage regression, once per Nightly (no browser/audio). */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import golden from "../../../docs/piano-benchmark-results.json";
import {
  loadPianoBenchmark,
  evaluatePianoBenchmark,
} from "../../../packages/music-practice/test-fixtures/piano-benchmark";
const corpus = loadPianoBenchmark();
assert.equal(
  createHash("sha256")
    .update(
      readFileSync(
        new URL(
          "../../../packages/music-practice/test-fixtures/piano-benchmark.json",
          import.meta.url,
        ),
      ),
    )
    .digest("hex"),
  golden.datasetSha256,
  "review changed corpus before updating quality baselines",
);
const results = Object.fromEntries(
  (["development", "validation"] as const).map((partition) => [
    partition,
    evaluatePianoBenchmark(corpus.filter((c) => c.partition === partition)),
  ]),
);
// Retain diagnostics and every mismatch even on failure; never hide abstention.
const dir = new URL("../work/piano-benchmark/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(
  new URL("results.json", dir),
  JSON.stringify(results, null, 2) + "\n",
);
for (const partition of ["development", "validation"] as const) {
  const actual = results[partition],
    expected = golden.partitions[partition].current;
  assert.equal(actual.summary.cases, expected.summary.cases);
  assert.equal(actual.summary.eligible, expected.summary.eligible);
  assert.equal(actual.summary.inferred, expected.summary.inferred);
  assert.equal(actual.summary.flagged, expected.summary.flagged);
  assert.ok(
    actual.summary.covered >= expected.summary.covered,
    `${partition}: eligible-note coverage regressed`,
  );
  assert.ok(
    actual.summary.predictedNotes >= expected.summary.predictedNotes,
    `${partition}: full-note coverage regressed`,
  );
  for (const [family, target] of Object.entries(expected.families)) {
    const observed = actual.families[family];
    assert.ok(observed, `${partition}:${family} missing`);
    assert.equal(observed.eligible, target.eligible);
    assert.equal(observed.cases, target.cases);
    assert.ok(
      observed.matches >= target.matches,
      `${partition}:${family}: editorial agreement regressed (${observed.matches}<${target.matches})`,
    );
  }
}
console.log(
  "PASS: complete permissive piano corpus retains editorial agreement and coverage; report " +
    new URL("results.json", dir).pathname,
);
