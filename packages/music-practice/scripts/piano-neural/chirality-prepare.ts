/** Export only score input; no reference digit enters the external decoder. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadPianoBenchmark } from "../../test-fixtures/piano-benchmark";
import { neuralContacts } from "../../test-fixtures/piano-neural-comparison";
const output = process.argv[2];
if (!output || existsSync(output)) throw Error("Specify a new request path");
const fresh = JSON.parse(
  readFileSync(
    new URL("../../test-fixtures/piano-czerny.json", import.meta.url),
    "utf8",
  ),
);
const cases = [
  ...(["hanon", "beringer", "beringer-scales"] as const).flatMap((source) =>
    loadPianoBenchmark(source).map((c) => ({
      ...c,
      id: source + ":" + c.id,
      scope: "old",
      unsupportedNotation: false,
    })),
  ),
  ...fresh.cases.map((c: any) => ({
    ...c,
    scope: "czerny",
    unsupportedNotation: fresh.inventory.find((x: any) => x.id === c.id)
      .unsupportedNotation,
  })),
];
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
writeFileSync(
  output,
  JSON.stringify(
    {
      schema: 1,
      scope:
        "Fixed published weights, no fitting/selection. Previously consumed Czerny and old corpora; cannot certify no overlap with upstream PIG training material.",
      cases: cases.map((c) => ({
        id: c.id,
        scope: c.scope,
        notesSha256: hash(JSON.stringify(c.notes)),
        unsupportedNotation: c.unsupportedNotation,
        hands: Object.fromEntries(
          (["right", "left"] as const).map((hand) => [
            hand,
            neuralContacts(c.notes)
              .filter((n) => n.hand === hand)
              .map((n) => ({ id: n.id, midi: n.midi })),
          ]),
        ),
      })),
    },
    null,
    2,
  ) + "\n",
);
