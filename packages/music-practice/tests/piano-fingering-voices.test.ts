import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import {
  collectPianoScore,
  planPianoScore,
  pianoScoreHands,
} from "../src/piano-score-fingering";
function tune(body: string) {
  const t = abcjs.parseOnly("X:1\nM:4/4\nL:1/4\n" + body)[0];
  t.setUpAudio({ chordsOff: true });
  return t;
}
const score = (melody: string, held = "G,4") =>
  tune(
    "%%score (r1 r2) l\nV:r1 clef=treble\nV:r2 clef=treble\nV:l clef=bass\nK:C\n[V:r1] " +
      melody +
      " |]\n[V:r2] " +
      held +
      " |]\n[V:l] C,D,E,F, |]",
  );
test("all voices share one hand timeline, including chords and same-onset unisons", () => {
  for (const [melody, held, count] of [
    ["CDEF", "G,4", 5],
    ["[CEG]4", "E4", 4],
  ] as const) {
    const { plan } = planPianoScore(score(melody, held));
    assert.equal(plan.status, "complete");
    assert.equal(plan.hands.right.notes.length, count);
    assert.equal(plan.hands.left.notes.length, 4);
  }
});
test("unsupported hand never leaves partial digits; other hand remains available", () => {
  const { plan } = planPianoScore(score("CDEF", "E4"));
  assert.equal(plan.status, "partial");
  assert.equal(plan.hands.right.notes.length, 0);
  assert.equal(plan.hands.right.diagnostic?.code, "overlapping_restrike");
  assert.equal(plan.hands.left.notes.length, 4);
});
test("mixed chord tie consumes only fresh MIDI attacks and retains contact identity", () => {
  const t = tune("K:C\n[C-E] [CF] D2 |]");
  const c = collectPianoScore(t);
  assert.deepEqual(
    c.notes.map((n) => n.midi),
    [60, 64, 60, 65, 62],
  );
  assert.equal(c.notes[2].tieFrom, c.notes[0].id);
  const { plan } = planPianoScore(t);
  assert.equal(plan.status, "complete");
  assert.equal(plan.notes[0].finger, plan.notes[2].finger);
  assert.equal(plan.notes[0].contactId, plan.notes[2].contactId);
});
test("rests advance the clock; numeric authored digits are hard constraints", () => {
  const c = collectPianoScore(tune("K:C\nz !3!C D2 |]"));
  assert.deepEqual(
    c.notes.map((n) => [n.start, n.duration, n.finger]),
    [
      [1, 1, 3],
      [2, 2, undefined],
    ],
  );
  const p = planPianoScore(tune("K:C\nz !3!C D2 |]"));
  assert.equal(p.plan.notes[0].finger, 3);
});
test("ambiguous authored chord digits suppress generated hand rather than guessing mapping", () => {
  const p = planPianoScore(tune("K:C\n!1!!3![CE]4 |]"));
  assert.equal(p.plan.hands.right.diagnostic?.code, "ambiguous_fingering");
  assert.equal(p.plan.notes.length, 0);
});
test("hand ownership survives clef changes and original staff reindexing", () => {
  const t = tune("K:C\nC4 |\n[K:clef=bass] C,4 |]");
  assert.equal(pianoScoreHands(t).get(0), "right");
  assert.ok(collectPianoScore(t).notes.every((n) => n.hand === "right"));
});
test("cropped incoming tie only starts a contact with actual MIDI evidence", () => {
  const t = tune("K:C\nC D3 |]");
  const first = t.lines[0].staff![0].voices![0].find(
    (n) => n.el_type === "note",
  )!;
  if (first.el_type === "note") first.pitches![0].endTie = true;
  assert.equal(collectPianoScore(t).notes[0].tieFrom, undefined);
  if (first.el_type === "note") first.midiPitches = [];
  assert.equal(collectPianoScore(t).diagnostics[0].code, "unknown_pitch");
});

test("score tempo is normalized to quarter beats and can be overridden", () => {
  const t = tune("Q:1/8=80\nK:C\n!1!C !1!c3 |]");
  const a = planPianoScore(t),
    b = planPianoScore(t, { profile: { bpm: 40 } }),
    fast = planPianoScore(t, { profile: { bpm: 160 } });
  assert.deepEqual(a.plan, b.plan);
  assert.ok(fast.plan.costs.movement > a.plan.costs.movement);
});
