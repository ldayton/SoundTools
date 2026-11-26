import { writeFileSync } from "node:fs";
import { loadPianoBenchmark } from "../../test-fixtures/piano-benchmark";
import { neuralContacts } from "../../test-fixtures/piano-neural-comparison";
const cases = (["hanon", "beringer", "beringer-scales"] as const).flatMap(
  (source) =>
    loadPianoBenchmark(source).map((c) => ({ ...c, id: source + ":" + c.id })),
);
if (!process.argv[2]) throw Error("Specify output file");
const requests = cases.map((c) => ({
  id: c.id,
  bpm: c.bpm,
  contacts: neuralContacts(c.notes).map((n) => ({
    ...n,
    time: (n.start * 60000) / c.bpm,
    duration: (n.duration * 60000) / c.bpm,
  })),
}));
writeFileSync(process.argv[2], JSON.stringify(requests));
console.log(
  JSON.stringify({
    cases: cases.length,
    notes: cases.reduce((s, c) => s + c.notes.length, 0),
    maxNotes: Math.max(...cases.map((c) => c.notes.length)),
    contacts: requests.reduce((s, c) => s + c.contacts.length, 0),
  }),
);
