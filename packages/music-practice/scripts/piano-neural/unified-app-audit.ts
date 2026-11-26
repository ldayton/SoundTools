import abcjs from "abcjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import hymns from "../../src/hymns.json";
import { instrumentEditionIds } from "../../src/instrument-editions";
import { arrangeHymn } from "../../src/hymn-arrangements";
import {
  collectPianoScore,
  planPianoScore,
} from "../../src/piano-score-fingering";
import {
  planUnifiedPianoPhrase,
  unifiedPianoPolicyVersion,
} from "../../research/chirality/unified";
import { neuralPhysicalViolations } from "../../test-fixtures/piano-neural-comparison";
const [weightsPath, output] = process.argv.slice(2);
if (!weightsPath || !output || existsSync(output))
  throw Error("Specify weights and a new app audit report");
const weights = JSON.parse(readFileSync(weightsPath, "utf8"));
const shifts = process.argv.includes("--all-keys")
  ? [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]
  : [0];
const rows = [];
for (const id of instrumentEditionIds)
  for (const shift of shifts) {
    const hymn = hymns.find((h) => h.id === id)!;
    const abc = arrangeHymn(hymn, "piano", 0).abc;
    const tune = abcjs.parseOnly(abc, { visualTranspose: shift })[0];
    tune.setUpAudio({ chordsOff: true, midiTranspose: shift });
    const before = JSON.stringify(tune.lines),
      input = collectPianoScore(tune),
      baseline = planPianoScore(tune).plan;
    const original = abcjs.parseOnly(abc)[0];
    original.setUpAudio({ chordsOff: true });
    const originalNotes = new Map(
      collectPianoScore(original).notes.map((n) => [n.id, n]),
    );
    if (
      input.diagnostics.length ||
      input.notes.length !== originalNotes.size ||
      input.notes.some((n) => {
        const prior = originalNotes.get(n.id);
        return (
          !prior ||
          n.midi !== prior.midi + shift ||
          n.start !== prior.start ||
          n.duration !== prior.duration
        );
      })
    )
      throw Error("Transposition changed the score contract: " + hymn.slug);
    const tempo = tune.metaText?.tempo;
    const bpm = tempo?.bpm
      ? (tempo.bpm * (tempo.duration?.reduce((a, b) => a + b, 0) ?? 0.25)) /
        0.25
      : 120;
    const candidate = planUnifiedPianoPhrase(input.notes, weights, { bpm });
    const byId = new Map(baseline.notes.map((n) => [n.id, n]));
    const conflicts = neuralPhysicalViolations(
      input.notes,
      new Map(candidate.plan.notes.map((n) => [n.id, n.finger])),
    );
    if (conflicts.length || JSON.stringify(tune.lines) !== before)
      throw Error("Invalid application candidate " + hymn.slug);
    const anchors = input.notes.filter((n) => n.finger !== undefined);
    if (
      anchors.some(
        (n) =>
          candidate.plan.notes.find((x) => x.id === n.id)?.finger !== n.finger,
      )
    )
      throw Error("Anchor lost");
    rows.push({
      id,
      shift,
      slug: hymn.slug,
      notes: input.notes.length,
      bpm,
      baselineStatus: baseline.status,
      candidateStatus: candidate.plan.status,
      changedDigits: candidate.plan.notes.filter(
        (n) => n.finger !== byId.get(n.id)?.finger,
      ).length,
      authoredAnchors: anchors.length,
      conflicts: conflicts.length,
      decisions: candidate.decisions,
    });
  }
const result = {
  policy: unifiedPianoPolicyVersion,
  hashes: {
    weights: createHash("sha256")
      .update(readFileSync(weightsPath))
      .digest("hex"),
    implementation: createHash("sha256")
      .update(
        readFileSync(
          new URL("../../research/chirality/unified.ts", import.meta.url),
        ),
      )
      .digest("hex"),
  },
  scope:
    "Read-only registered piano editions, optional twelve nearest-register semitone transpositions, frozen V3 and fixed published weights; baseline is the shared classic planner, not the legacy published UI callback tables. No product activation, label fitting or score data changes.",
  rows,
  summary: {
    editions: instrumentEditionIds.length,
    cases: rows.length,
    changedCases: rows.filter((r) => r.changedDigits).length,
    changedSongs: new Set(rows.filter((r) => r.changedDigits).map((r) => r.id))
      .size,
    defaultKeyChangedDigits: rows
      .filter((r) => r.shift === 0)
      .reduce((s, r) => s + r.changedDigits, 0),
    changedDigits: rows.reduce((s, r) => s + r.changedDigits, 0),
    physicalConflicts: rows.reduce((s, r) => s + r.conflicts, 0),
  },
};
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
