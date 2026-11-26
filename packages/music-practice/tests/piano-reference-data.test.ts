import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { loadPianoBenchmark } from "../test-fixtures/piano-benchmark";
test("Beringer transcription remains reproducible, completed rather than printed, and source families stay reserved", () => {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      new URL("../scripts/import-piano-beringer.ts", import.meta.url).pathname,
      "--check",
    ],
    { stdio: "pipe" },
  );
  const cases = loadPianoBenchmark("beringer");
  assert.equal(cases.length, 72);
  assert.equal(cases.filter((c) => c.partition === "validation").length, 48);
  for (const c of cases) {
    assert.equal(c.evidence, "completed");
    assert.ok(c.labels.every((l) => l.kind === "completed"));
    assert.ok(c.notes.every((n) => n.finger === undefined));
    if (c.family === "beringer-arpeggios")
      assert.ok(
        c.notes.some((n) => n.phraseStart),
        "source phrase boundaries retained: " + c.id,
      );
    assert.equal(
      c.partition,
      c.family === "beringer-arpeggios" ? "validation" : "development",
    );
  }
});

test("reserved scale family retains unlabelled coverage and identical uncertain positions across alternatives", () => {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      new URL("../scripts/import-piano-beringer.ts", import.meta.url).pathname,
      "--scales",
      "--check",
    ],
    { stdio: "pipe" },
  );
  const cases = loadPianoBenchmark("beringer-scales");
  assert.equal(cases.length, 38);
  assert.equal(
    cases.filter((c) => c.labels.every((l) => l.kind === "flagged")).length,
    26,
  );
  for (const c of cases) {
    assert.equal(c.partition, "validation");
    assert.equal(c.evidence, "completed");
    assert.ok(c.notes.every((n) => n.finger === undefined));
    const flagged = c.labels
      .filter((l) => l.kind === "flagged")
      .map((l) => l.id);
    for (const labels of [c.labels, ...(c.alternatives ?? [])]) {
      assert.deepEqual(
        labels.filter((l) => l.kind === "flagged").map((l) => l.id),
        flagged,
      );
      assert.ok(
        labels
          .filter((l) => l.kind === "flagged")
          .every((l) => l.finger === undefined && l.reason),
      );
    }
  }
  const partial = cases.find((c) => c.id.endsWith("bflat_major"))!;
  assert.equal(partial.labels.filter((l) => l.kind === "flagged").length, 1);
});
