import { swingAudio } from "../../../packages/music-practice/src/hymn-swing";
import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";

test("fingerstyle blues retains tab pitches, swing, chorus repeat and final E7", () => {
  const song = hymns.find((h) => h.slug === "the-1st-fingerstyle-blues")!;
  assert(song);
  assert.match(song.harmony, /^Q:"Swing"$/m);
  assert.doesNotMatch(song.harmony, /\(3/);
  assert.doesNotMatch(song.melody, /\(3/);
  assert.equal(song.stanzas[0].label, "Instrumental");
  for (const abc of [song.melody, song.harmony]) {
    const tune = abcjs.parseOnly(abc)[0];
    assert.equal(tune.warnings?.length || 0, 0);
    const audio = swingAudio(tune.setUpAudio({ qpm: 60, chordsOff: true }), true);
    const notes = audio.tracks[0].filter((n) => n.cmd === "note");
    assert.deepEqual(notes.slice(0, 6).map((n) => n.pitch), [64, 67, 64, 67, 69, 64]);
    assert(Math.abs(notes[0].start - 1 / 6) < 1e-6);
    assert(Math.abs(notes[1].start - 1 / 4) < 1e-6);
    assert(Math.abs(audio.totalDuration - 25) < 1e-6);
  }
  const tune = abcjs.parseOnly(song.harmony)[0];
  const notes = swingAudio(tune.setUpAudio({ qpm: 60, chordsOff: true }), true).tracks
    .flatMap((track) => track.filter((n) => n.cmd === "note"));
  assert.deepEqual(notes.filter((n) => n.start === 24).map((n) => n.pitch).sort((a,b) => a-b),
    [40, 47, 52, 56, 62, 64]);
});

// Independent sounding pitches from the supplied standard-tuning tablature.
// Onsets are in quarter-note beats, with the printed 2:1 swing applied.
test("every tab attack matches both chorus passes and the closing chord", () => {
  const song = hymns.find((h) => h.slug === "the-1st-fingerstyle-blues")!;
  const riff = [[2/3,64],[1,67],[5/3,64],[2,67],[8/3,69],[11/3,64]];
  const answer = [[0,67],[2/3,64],[1,67],[5/3,64]];
  const melody = [riff,answer,riff,answer,riff,answer,riff,answer,
    [[2/3,59],[1,66],[5/3,59],[2,66],[8/3,66]],
    [[2/3,61],[1,67],[5/3,61],[2,67],[8/3,67]],riff,
    [[2/3,64],[1,67],[3,52],[3,56],[3,61]]];
  const bass = [40,40,40,40,45,45,40,40,47,45,40].map(p =>
    [0,1,2,3].map(beat => [beat,p]));
  bass.push([[0,40],[1,40],[5/3,45],[2,46]]);
  const expected = (bars: number[][][], ending: number[]) => {
    const notes: number[][] = [];
    for (const pass of [0,1]) bars.forEach((bar,i) => bar.forEach(([beat,pitch]) =>
      notes.push([Math.round((pass*48+i*4+beat)*1e4),pitch])));
    ending.forEach(pitch => notes.push([96e4,pitch]));
    return notes.sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  };
  const tune = abcjs.parseOnly(song.harmony)[0];
  const tracks = swingAudio(tune.setUpAudio({qpm:60,chordsOff:true}), true).tracks;
  const attacks = (index: number) => tracks[index].flatMap(n => n.cmd === "note"
    ? [[Math.round(n.start*4*1e4),n.pitch]] : []).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  assert.deepEqual(attacks(0), expected(melody,[52,56,62,64]));
  assert.deepEqual(attacks(1), expected(bass,[40,47]));
});
