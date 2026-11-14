import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { arrangeHymn, ARRANGEMENTS } from "../../../packages/music-practice/src/hymn-arrangements";
const fixture = {
  ...hymns[0],
  id: "learner-bass-fixture",
  key: "C",
  meter: "4/4",
  harmony:
    "X:1\nM:4/4\nL:1/4\n%%score M | B\nV:M clef=treble\nV:B clef=bass\nK:C\n[V:M] C D E F | G4 | E2 z2 |]\nw: one two three four five six\n[V:B] C, C, G,,2 | G,,4 | C,2 z2 |]\n",
};
function parse(abc: string) {
  const tune = abcjs.parseOnly(abc)[0];
  assert.equal(tune.warnings?.length || 0, 0, abc);
  const audio = tune.setUpAudio({ qpm: 60, chordsOff: true });
  return {
    tune,
    audio,
    notes: audio.tracks
      .flatMap((t) => t.flatMap((n) => (n.cmd === "note" ? [n] : [])))
      .sort((a, b) => a.start - b.start),
  };
}
test("learner bass retains changes within a bar, holds repeats and ties across bars, and keeps rests", () => {
  const { tune, audio, notes } = parse(
    arrangeHymn(fixture, "bass", 0, 0, "left").abc,
  );
  assert.equal(tune.lines[0].staff?.length, 1);
  assert.equal(tune.lines[0].staff?.[0].clef?.type, "bass");
  assert.deepEqual(
    notes.map((n) => [n.pitch, n.start, n.duration]),
    [
      [48, 0, 0.5],
      [43, 0.5, 1.5],
      [48, 2, 0.5],
    ],
  );
  assert.equal(audio.totalDuration, 3, "trailing rest stays in the score");
  const section = parse(arrangeHymn(fixture, "bass", 2, 1, "left").abc);
  assert.equal(section.notes[0].pitch, 48);
});
test("right, left and both hands contain only their selected parts", () => {
  const right = parse(arrangeHymn(fixture, "bass", 0, 0, "right").abc);
  const left = parse(arrangeHymn(fixture, "bass", 0, 0, "left").abc);
  const both = parse(arrangeHymn(fixture, "bass", 0, 0, "both").abc);
  assert.deepEqual(
    right.notes.map((n) => n.pitch),
    [60, 62, 64, 65, 67, 64],
  );
  assert.equal(both.tune.lines[0].staff?.length, 2);
  assert.deepEqual(
    both.notes
      .filter((n) => n.pitch < 60)
      .map((n) => [n.pitch, n.start, n.duration]),
    left.notes.map((n) => [n.pitch, n.start, n.duration]),
  );
  assert.deepEqual(
    both.notes
      .filter((n) => n.pitch >= 60)
      .map((n) => [n.pitch, n.start, n.duration]),
    right.notes.map((n) => [n.pitch, n.start, n.duration]),
  );
});
test("all hymns offer readable single-note bass and valid separate-hand arrangements", () => {
  for (const hymn of hymns)
    for (const hand of ["left", "right", "both"] as const) {
      for (const a of ARRANGEMENTS) {
        const { audio, notes } = parse(arrangeHymn(hymn, a.id, 0, 0, hand).abc);
        assert.ok(
          audio.totalDuration > 0 && notes.length > 0,
          `${hymn.id} ${a.id} ${hand}`,
        );
        if (a.id === "bass" && hand === "left") {
          for (let i = 1; i < notes.length; i++)
            assert.ok(
              notes[i].start >=
                notes[i - 1].start + notes[i - 1].duration - 0.00001,
              "left-hand learner part never asks for chords",
            );
        }
      }
    }
});
