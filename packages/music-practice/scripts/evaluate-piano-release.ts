import { writeFileSync } from "node:fs";
import { loadPianoBenchmark } from "../test-fixtures/piano-benchmark";
import { comparePianoRelease } from "../test-fixtures/piano-release-comparison";
const cases = [
  ...loadPianoBenchmark(),
  ...loadPianoBenchmark("beringer"),
  ...loadPianoBenchmark("beringer-scales"),
];
const result = await comparePianoRelease(cases);
if (!process.argv[2]) throw Error("Specify output JSON file");
writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      baselineRevision: result.baselineRevision,
      summary: result.summary,
      families: result.families,
      comparable: result.comparable,
      excluded: result.excluded.length,
    },
    null,
    2,
  ),
);
