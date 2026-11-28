/** Full data-only quality/coverage regression, once per Nightly. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import gestures from "../../../docs/piano-gestures-results.json";
import release from "../../../docs/piano-release-results.json";
import { comparePianoRelease } from "../../../packages/music-practice/test-fixtures/piano-release-comparison";
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
for (const [file, hash] of Object.entries(gestures.dataSha256))
  assert.equal(
    createHash("sha256")
      .update(
        readFileSync(
          new URL(
            "../../../packages/music-practice/test-fixtures/" + file,
            import.meta.url,
          ),
        ),
      )
      .digest("hex"),
    hash,
    "review gesture reference data",
  );
results["scales:classic"] = evaluatePianoBenchmark(
  loadPianoBenchmark("beringer-scales"),
);
guard(
  results["scales:classic"],
  release.production["scales:classic"],
  "scales:classic",
);
// Explicit research weights retain their own floors; never replace defaults.
for (const trial of gestures.validation.trials)
  for (const [tag, expected] of Object.entries(trial.corpora)) {
    const source =
      tag === "scales" ? "beringer-scales" : (tag as "hanon" | "beringer");
    const baseline =
      trial.weight === 0 && source !== "beringer-scales"
        ? results[`${source}:validation:ergonomic`]
        : undefined;
    const actual =
      baseline ??
      evaluatePianoBenchmark(
        loadPianoBenchmark(source).filter((c) => c.partition === "validation"),
        (ns, p) =>
          planPianoPhrase(ns, {
            ...p,
            model: "ergonomic",
            weights: { gesture: trial.weight },
          }),
      );
    results[`gesture:${source}:${trial.weight}`] = actual;
    guard(actual, expected, `gesture:${source}:${trial.weight}`);
    for (const [metric, floor] of Object.entries(expected.summary.sequence))
      assert.ok(
        actual.summary.sequence[metric] >= floor,
        `gesture:${source}:${trial.weight}:${metric}`,
      );
  }
const comparison = await comparePianoRelease([
  ...loadPianoBenchmark(),
  ...loadPianoBenchmark("beringer"),
  ...loadPianoBenchmark("beringer-scales"),
]);
assert.equal(
  comparison.baselineSha256,
  release.comparison.baselineSha256,
  "released baseline changed",
);
assert.equal(comparison.comparable, release.comparison.comparable);
assert.deepEqual(comparison.excluded, release.comparison.excluded);
assert.equal(comparison.summary.eligible, release.comparison.summary.eligible);
assert.ok(
  comparison.summary.after >= release.comparison.summary.after &&
    comparison.summary.after > comparison.summary.before,
  "must remain a measured win over released main",
);
for (const [family, v] of Object.entries(comparison.families)) {
  assert.ok(v.after >= v.before, `released family regression: ${family}`);
  assert.ok(
    v.after >=
      release.comparison.families[
        family as keyof typeof release.comparison.families
      ].after,
    `release floor regression: ${family}`,
  );
}
const releaseRows = new Map(
  release.comparison.rows.map((row) => [row.id, row]),
);
for (const row of comparison.rows) {
  const target = releaseRows.get(row.id);
  assert.ok(target, `missing release comparison case: ${row.id}`);
  assert.ok(
    row.after >= Math.min(row.before, target.after),
    `new or worsened individual regression: ${row.id}`,
  );
}
for (const row of comparison.rows)
  if (row.afterCovered < row.beforeCovered)
    assert.ok(
      row.collisionNotes.length > 0 &&
        row.diagnostics.length > 0 &&
        row.diagnostics.every((d) => d.code === "hand_conflict"),
      `unexplained released coverage loss: ${row.id}`,
    );
const dir = new URL("../work/piano-benchmark/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(
  new URL("results.json", dir),
  JSON.stringify(results, null, 2) + "\n",
);
for (const partition of ["development", "validation"] as const) {
  guard(
    results["original:" + partition],
    release.production[`original:${partition}`],
    "original:" + partition,
  );
  for (const source of ["hanon", "beringer"] as const)
    for (const model of ["classic", "ergonomic"] as const)
      guard(
        results[`${source}:${partition}:${model}`],
        model === "classic"
          ? release.production[`${source}:${partition}:classic`]
          : golden.corpora[source].partitions[partition][model],
        `${source}:${partition}:${model}`,
      );
}
console.log(
  "PASS: release-default floors, direct-main improvement gate, expanded references and separate experimental floors; report " +
    new URL("results.json", dir).pathname,
);
