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
    assert.equal(
      c.partition,
      c.family === "beringer-arpeggios" ? "validation" : "development",
    );
  }
});
