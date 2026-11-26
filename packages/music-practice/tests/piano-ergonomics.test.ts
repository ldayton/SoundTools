import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import {
  planPianoPhrase,
  type PianoPhraseNote,
} from "../src/piano-phrase-fingering";
import {
  pianoPairPossible,
  pianoPairComfort,
  pianoContextCost,
  pianoKeyDepthCost,
} from "../src/piano-ergonomics";
import { collectPianoScore } from "../src/piano-score-fingering";
import {
  comparePianoReference,
  type PianoBenchmarkCase,
  scorePianoBenchmarkCase,
} from "../test-fixtures/piano-benchmark";
const n = (
  id: string,
  midi: number,
  start = 0,
  duration = 1,
  finger?: number,
  hand: "right" | "left" = "right",
): PianoPhraseNote => ({ id, midi, start, duration, finger, hand });
const plan = (notes: PianoPhraseNote[]) =>
  planPianoPhrase(notes, { model: "ergonomic" });
test("practical finger-pair reach is distinct from comfort and measured key width", () => {
  assert.ok(pianoPairPossible(60, 2, 65, 3, 7)); // five semitones, not converted to an approximate white-key limit
  assert.ok(pianoPairPossible(60, 1, 72, 4, 7));
  assert.ok(!pianoPairPossible(60, 1, 72, 4, 4));
  assert.ok(!pianoPairPossible(60, 3, 67, 4, 7));
  assert.ok(pianoPairComfort(60, 1, 64, 2) < pianoPairComfort(60, 1, 64, 5));
  for (const hand of ["right", "left"] as const) {
    const p = plan([
      n("lo", 60, 0, 1, hand === "right" ? 1 : 4, hand),
      n("hi", 72, 0, 1, hand === "right" ? 4 : 1, hand),
    ]);
    assert.equal(p.status, "complete");
    assert.equal(new Set(p.notes.map((n) => n.finger)).size, 2);
  }
});
test("voice/phrase boundaries and held contacts retain hard constraints", () => {
  const ns = [
    { ...n("held", 55, 0, 4, 1), voice: "bass" },
    ...[60, 64, 62].map((m, i) => ({
      ...n(`m${i}`, m, i, 1, i + 2),
      voice: "melody",
    })),
  ];
  const p = plan(ns);
  assert.equal(p.status, "complete");
  assert.ok(p.hands.right.states.every((s) => s.fingers.held === 1));
  const a = { id: "a", midi: 60, finger: 3, start: 0, end: 1, voice: "a" },
    b = { ...a, id: "b", midi: 62, finger: 4, start: 1, end: 2 },
    c = { ...a, id: "c", midi: 64, finger: 5, start: 2, end: 3 };
  assert.ok(pianoContextCost(a, b, c) > 0);
  assert.equal(pianoContextCost(a, b, { ...c, voice: "other" }), 0);
  assert.throws(() => plan([{ ...n("bad", 60), voice: "" }]));
});
test("black/white key level affects passage preference without forbidding a black thumb", () => {
  assert.ok(
    pianoKeyDepthCost({ midi: 60 }, { midi: 61 }, 2, 1) >
      pianoKeyDepthCost({ midi: 61 }, { midi: 63 }, 2, 1),
  );
  assert.equal(plan([n("black", 61, 0, 1, 1)]).status, "complete");
});
test("future chords affect the same opening note; preferences never lock a required alternative", () => {
  const forward = plan([
      n("opening", 60),
      n("a", 64, 1, 1, 1),
      n("b", 67, 1, 1, 3),
      n("c", 72, 1, 1, 5),
    ]),
    back = plan([
      n("opening", 60),
      n("a", 53, 1, 1, 1),
      n("b", 57, 1, 1, 3),
      n("c", 60, 1, 1, 5),
    ]);
  assert.equal(forward.status, "complete");
  assert.equal(back.status, "complete");
  assert.notEqual(forward.notes[0].finger, back.notes[0].finger);
  const anchored = plan([
    n("opening", 60, 0, 1, 2),
    n("a", 53, 1, 1, 1),
    n("b", 57, 1, 1, 3),
    n("c", 60, 1, 1, 5),
  ]);
  assert.equal(anchored.status, "complete");
  assert.equal(anchored.notes[0].finger, 2);
});
test("explicit staccato separates key hold from notation clock, without changing the score", () => {
  const t = abcjs.parseOnly("X:1\nL:1/4\nK:C\n.C D E2 |]")[0];
  t.setUpAudio({ chordsOff: true });
  const before = JSON.stringify(t.lines);
  const c = collectPianoScore(t);
  assert.equal(c.notes[0].duration, 0.5);
  assert.equal(c.notes[0].notatedDuration, 1);
  assert.equal(c.notes[1].start, 1);
  assert.ok(c.notes.every((n) => n.voice));
  assert.equal(JSON.stringify(t.lines), before);
  const detached = plan([n("a", 60, 0, 0.5, 1), n("b", 62, 1, 0.5, 1)]);
  assert.equal(detached.status, "complete");
});
test("diagnostics separate feasible preferred references from geometry failure; alternatives are whole sequences", () => {
  const c: PianoBenchmarkCase = {
    id: "case",
    family: "synthetic",
    source: "ours",
    partition: "development",
    bpm: 60,
    notes: [n("a", 60), n("b", 62, 1)],
    labels: [
      { id: "a", finger: 1, kind: "printed" },
      { id: "b", finger: 2, kind: "printed" },
    ],
  };
  const audit = comparePianoReference(c, (ns, p) =>
    planPianoPhrase(ns, { ...p, model: "ergonomic" }),
  );
  assert.ok(
    ["tied-optimum", "preference-disagreement"].includes(
      audit.hands.right.classification,
    ),
  );
  assert.ok(audit.hands.right.costGap! >= -1e-7);
  const prediction = plan(c.notes);
  prediction.notes[0].finger = 1;
  prediction.notes[1].finger = 2;
  c.labels = [
    { id: "a", finger: 1, kind: "printed" },
    { id: "b", finger: 4, kind: "printed" },
  ];
  c.alternatives = [
    [
      { id: "a", finger: 3, kind: "printed" },
      { id: "b", finger: 2, kind: "printed" },
    ],
  ];
  assert.equal(
    scorePianoBenchmarkCase(c, prediction).matches,
    1,
    "cannot assemble a perfect reference by picking digits from incompatible sequences",
  );
});

test("an explicit phrase break resets speculative finger history", () => {
  const notes = [60, 62, 64].map((midi, i) => ({
    ...n(String(i), midi, i, 1, i + 3),
    voice: "melody",
  }));
  const connected = plan(notes),
    separated = plan(notes.map((n, i) => ({ ...n, phraseStart: i === 2 })));
  assert.equal(connected.status, "complete");
  assert.equal(separated.status, "complete");
  assert.ok(connected.costs.context > 0);
  assert.equal(separated.costs.context, 0);
});

test("production default accepts fixed fourth-finger octaves without enabling experimental scoring", () => {
  const p = planPianoPhrase([n("lo", 60, 0, 1, 1), n("hi", 72, 0, 1, 4)]);
  assert.equal(p.status, "complete");
  assert.deepEqual(
    p.notes.map((n) => n.finger),
    [1, 4],
  );
  assert.equal(p.costs.context, 0);
});
