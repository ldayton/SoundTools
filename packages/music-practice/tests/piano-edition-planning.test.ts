import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../src/hymns.json";
import { instrumentEditionIds } from "../src/instrument-editions";
import { arrangeHymn } from "../src/hymn-arrangements";
import {
  collectPianoScore,
  planPianoScore,
} from "../src/piano-score-fingering";
import { neuralPhysicalViolations } from "../test-fixtures/piano-neural-comparison";

for (const id of instrumentEditionIds)
  test(`registered piano edition ${id} uses the complete timed score safely`, () => {
    const hymn = hymns.find((h) => h.id === id)!;
    const tune = abcjs.parseOnly(arrangeHymn(hymn, "piano", 0).abc)[0];
    tune.setUpAudio({ chordsOff: true });
    const before = JSON.stringify(tune.lines);
    const { plan } = planPianoScore(tune);
    assert.equal(plan.status, "complete", JSON.stringify(plan.diagnostics));
    assert.ok(plan.notes.length > 0);
    const source = collectPianoScore(tune);
    assert.deepEqual(
      plan.notes.map((n) => n.id),
      source.notes.map((n) => n.id),
    );
    for (const n of source.notes.filter((n) => n.finger !== undefined))
      assert.equal(plan.notes.find((p) => p.id === n.id)?.finger, n.finger);
    assert.equal(
      neuralPhysicalViolations(
        plan.notes,
        new Map(plan.notes.map((n) => [n.id, n.finger])),
      ).length,
      0,
    );
    assert.equal(
      JSON.stringify(tune.lines),
      before,
      "planning does not rewrite the music",
    );
  });
