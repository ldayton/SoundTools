import { test } from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { ARRANGEMENTS, arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import {
  HYMN_KEYS,
  hymnTransposition,
  hymnKeySuffix,
} from "../../../packages/music-practice/src/hymn-transpose";
function notes(abc: string, semitones = 0) {
  const tune = abcjs.parseOnly(abc, { visualTranspose: semitones })[0];
  assert.equal(tune.warnings?.length || 0, 0);
  tune.setUpAudio({ midiTranspose: semitones });
  return tune.lines
    .flatMap((l) => l.staff || [])
    .flatMap((s) => s.voices)
    .flat()
    .filter((n: any) => n?.el_type === "note")
    .map((n: any) => ({
      duration: n.duration,
      pitches: (n.midiPitches || []).map((p: { pitch: number }) => p.pitch),
      lyrics: n.lyric,
      ties: n.pitches?.map((p: any) => [!!p.startTie, !!p.endTie]),
    }));
}
function shifted(abc: string, steps: number) {
  return notes(abc).map((n) => ({
    ...n,
    pitches: n.pitches.map((p: number) => p + steps),
  }));
}
test("transpose all voices, chromatic accidentals, ties, lyrics and slash chords up and down", () => {
  const source =
    'X:1\nM:4/4\nL:1/4\n%%score T | B\nV:T clef=treble\nV:B clef=bass\nK:C\n[V:T] "C/E"C ^C =C _E | "G7/B"[GBd]2 A-A | A4 |]\nw: one two three four five six _ seven\n[V:B] C, E, G, C | G,,2 D,2 | C,4 |]\n';
  for (const [key, steps] of [
    ["D", 2],
    ["Bb", -2],
    ["F#", 6],
  ] as const) {
    const result = hymnTransposition("C", key);
    assert.equal(result.semitones, steps);
    assert.deepEqual(notes(source, result.semitones), shifted(source, steps));
    const signature = abcjs
      .parseOnly(source, { visualTranspose: steps })[0]
      .getKeySignature();
    assert.equal(signature.root + signature.acc, key);
  }
  const chords = (key: "D" | "Bb" | "F#") =>
    abcjs
      .parseOnly(source, {
        visualTranspose: hymnTransposition("C", key).semitones,
      })[0]
      .lines.flatMap((l) => l.staff || [])
      .flatMap((s) => s.voices)
      .flat()
      .flatMap((n: any) =>
        n?.el_type === "note"
          ? n.chord?.map((c: { name: string }) => c.name) || []
          : [],
      );
  assert.ok(chords("D").includes("D/F♯"));
  assert.ok(chords("Bb").includes("B♭/D"));
  assert.ok(chords("F#").includes("F♯/A♯"));
});
test("original requires no transformation and old bookmark keys remain valid; each different key is separate", () => {
  assert.equal(hymnTransposition("G", "original").semitones, 0);
  assert.equal(hymnTransposition("G", "G").semitones, 0);
  assert.equal(hymnKeySuffix("G", "original"), "");
  assert.equal(hymnKeySuffix("G", "G"), "");
  assert.notEqual(hymnKeySuffix("G", "F"), hymnKeySuffix("G", "A"));
  assert.throws(() => hymnTransposition("G", "Am" as any));
});
test("every repertoire arrangement transposes to every offered key without dropping or clamping pitches", () => {
  for (const hymn of hymns)
    for (const a of ARRANGEMENTS)
      for (const size of [0, 2]) {
        const original = arrangeHymn(hymn, a.id, size).abc;
        for (const key of HYMN_KEYS) {
          const result = hymnTransposition(hymn.key, key);
          assert.deepEqual(
            notes(original, result.semitones),
            shifted(original, result.semitones),
            `${hymn.id} ${a.id} ${size} ${key}`,
          );
        }
      }
});
test("derived arrangements retain source chord symbols before transposition", () => {
  const hymn = {
    ...hymns[0],
    id: "chord-symbol-fixture",
    key: "C",
    meter: "4/4",
    harmony:
      'X:1\nM:4/4\nL:1/4\nK:C\n"C/E"C E G c | "G7/B"B G D G |]\nw: one two three four five six seven eight\n',
  };
  for (const a of ARRANGEMENTS)
    for (const size of [0, 2]) {
      const abc = arrangeHymn(hymn, a.id, size).abc;
      const tune = abcjs.parseOnly(abc, { visualTranspose: 2 })[0];
      const chords = tune.lines
        .flatMap((l) => l.staff || [])
        .flatMap((s) => s.voices)
        .flat()
        .flatMap((n: any) =>
          n?.el_type === "note"
            ? n.chord?.map((c: { name: string }) => c.name) || []
            : [],
        );
      assert.ok(chords.includes("D/F♯"), a.id);
      assert.ok(chords.includes("A7/C♯"), a.id);
    }
});
