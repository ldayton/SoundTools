import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import { pianoFingeringVoices } from "../src/hymn-fingering";
function tune(body: string) {
  const t = abcjs.parseOnly("X:1\nM:4/4\nL:1/4\n" + body)[0];
  t.setUpAudio({ chordsOff: true });
  return t;
}
test("separate monophonic hands retain generated suggestions", () => {
  const parts = pianoFingeringVoices(
    tune(
      "%%score r l\nV:r clef=treble\nV:l clef=bass\nK:C\n[V:r] CDEF |]\n[V:l] C,D,E,F, |]",
    ),
  );
  assert.deepEqual(
    parts.map((p) => [p.hand, p.notes.length]),
    [
      ["right", 4],
      ["left", 4],
    ],
  );
});
test("a chord or multiple voices suppresses the entire unsupported hand, not just one voice", () => {
  for (const melody of ["[CEG]4", "CDEF"]) {
    const parts = pianoFingeringVoices(
      tune(
        "%%score (r1 r2) l\nV:r1 clef=treble\nV:r2 clef=treble\nV:l clef=bass\nK:C\n[V:r1] " +
          melody +
          " |]\n[V:r2] E4 |]\n[V:l] C,D,E,F, |]",
      ),
    );
    assert.deepEqual(
      parts.map((p) => [p.hand, p.notes.length]),
      [["left", 4]],
    );
  }
});
test("a passage starting with a continuation cannot invent a preceding held finger", () => {
  const t = tune("K:C\nC-C D2 |]"),
    voice = t.lines[0].staff![0].voices?.[0];
  assert.ok(voice);
  const first = voice.find((n) => n.el_type === "note")!;
  if (first.el_type === "note") first.pitches![0].endTie = true;
  const notes = pianoFingeringVoices(t)[0].notes;
  assert.equal(notes[0].note.tied, false);
  assert.equal(notes[1].note.tied, true);
});
