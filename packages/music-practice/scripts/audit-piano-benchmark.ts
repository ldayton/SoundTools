/** Reproducible explanation tool; never executes external fingering algorithms. */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  loadPianoBenchmark,
  comparePianoReference,
} from "../test-fixtures/piano-benchmark";
import { planPianoPhrase } from "../src/piano-phrase-fingering";
const source = process.argv[2] === "beringer" ? "beringer" : "hanon",
  id = process.argv[3];
if (!id) throw Error("Specify source (hanon|beringer) and case ID");
const c = loadPianoBenchmark(source).find((c) => c.id === id);
if (!c) throw Error("Unknown benchmark case");
const models = Object.fromEntries(
  (["classic", "ergonomic"] as const).map((model) => [
    model,
    comparePianoReference(c, (notes, p) =>
      planPianoPhrase(notes, { ...p, model }),
    ),
  ]),
);
const dir = new URL("../../../work/piano-audits/", import.meta.url);
mkdirSync(dir, { recursive: true });
const path = new URL(id.replace(/[^\w-]/g, "_") + ".json", dir);
writeFileSync(path, JSON.stringify(models, null, 2) + "\n");
console.log(path.pathname);
