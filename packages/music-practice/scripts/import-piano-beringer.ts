/** Data-only import using our existing notation parser. No upstream code executes. */
import abcjs from "abcjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { collectPianoScore } from "../src/piano-score-fingering";
const base = new URL("../test-fixtures/external/pydactyl/", import.meta.url),
  manifest = JSON.parse(readFileSync(new URL("manifest.json", base), "utf8"));
const cases = [];
for (const entry of manifest.files.filter((e: { path: string }) =>
  e.path.startsWith("beringer2/"),
)) {
  const bytes = readFileSync(new URL(entry.path, base));
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
    throw Error("Changed upstream reference");
  const abc = bytes.toString("utf8"),
    tune = abcjs.parseOnly(abc)[0];
  tune.setUpAudio({ chordsOff: true });
  const collected = collectPianoScore(tune);
  if (collected.diagnostics.length)
    throw Error(entry.path + ": ambiguous notes");
  const notes = collected.notes.map(({ finger, ...n }) => n),
    id = entry.path.replaceAll("/", "-").replace(".abcd", "");
  const annotations = [...abc.matchAll(/^% abcD fingering \d+: (.+)$/gm)].map(
    (m) => m[1].split("@"),
  );
  const alternatives = [];
  for (const annotation of annotations) {
    const labels = [];
    let valid = true;
    for (const [hi, hand] of ["right", "left"].entries()) {
      const ns = notes.filter((n) => n.hand === hand),
        digits = (annotation[hi] || "").replace(/[<>\s&.,;]/g, "");
      if (digits === "x" || !digits.length) {
        valid = false;
        break;
      }
      if (!/^[1-5]+$/.test(digits) || digits.length !== ns.length)
        throw Error(
          `${entry.path}: ${hand} reference ${digits.length} != ${ns.length}`,
        );
      labels.push(
        ...ns.map((n, i) => ({
          id: n.id,
          finger: +digits[i],
          kind: "completed" as const,
        })),
      );
    }
    if (valid) alternatives.push(labels);
  }
  if (!alternatives.length) throw Error(entry.path + ": no full reference");
  const family = entry.path.includes("/arpeggios/")
    ? "beringer-arpeggios"
    : "beringer-broken-chords";
  cases.push({
    id,
    family,
    source: entry.path,
    partition: family === "beringer-arpeggios" ? "validation" : "development",
    bpm: 60,
    notes,
    labels: alternatives[0],
    alternatives: alternatives.slice(1),
    evidence: "completed",
    description:
      "Beringer/Dunhill (1900); David Randolph transcription; gaps filled, printed locations not distinguished",
  });
}
const text =
    JSON.stringify({ schema: 1, sourceRevision: manifest.revision, cases }) +
    "\n",
  dest = new URL("../test-fixtures/piano-beringer.json", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(dest, "utf8") !== text) throw Error("Stale Beringer import");
} else writeFileSync(dest, text);
console.log(
  `Imported ${cases.length} source cases without running upstream programs.`,
);
