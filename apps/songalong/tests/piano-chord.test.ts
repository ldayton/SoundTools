import test from "node:test";
import assert from "node:assert/strict";
import { pianoChord } from "../../../packages/music-practice/src/piano-chord";
test("teacher chords have ordered triads and the slash note as bass", () => {
  for (const [name, notes, labels] of [
    ["D", [50, 54, 57], ["D3", "F♯3", "A3"]],
    ["G", [55, 59, 62], ["G3", "B3", "D4"]],
    ["A", [57, 61, 64], ["A3", "C♯4", "E4"]],
    ["D/F#", [54, 57, 62], ["F♯3", "A3", "D4"]],
    ["Bm", [59, 62, 66], ["B3", "D4", "F♯4"]],
    ["Em", [52, 55, 59], ["E3", "G3", "B3"]],
    ["E♭/G", [55, 58, 63], ["G3", "B♭3", "E♭4"]],
    ["Dm", [50, 53, 57], ["D3", "F3", "A3"]],
    ["C/F", [53, 55, 60, 64], ["F3", "G3", "C4", "E4"]],
    ["C♭", [59, 63, 66], ["C♭4", "E♭4", "G♭4"]],
  ] as const)
    assert.deepEqual(
      pianoChord(name),
      { notes: [...notes], labels: [...labels] },
      name,
    );
  assert.deepEqual(pianoChord("D/F♯"), pianoChord("D/F#"));
});
test("unrecognized chord symbols never invent a piano voicing", () => {
  for (const name of ["", "N.C.", "Dmaj9", "D (Bm)"])
    assert.equal(pianoChord(name), undefined);
});

test("dominant and minor sevenths retain the seventh and spell every tone",()=>{
  assert.deepEqual(pianoChord("F7"),{notes:[53,57,60,63],labels:["F3","A3","C4","E♭4"]});
  assert.deepEqual(pianoChord("E7"),{notes:[52,56,59,62],labels:["E3","G♯3","B3","D4"]});
  assert.deepEqual(pianoChord("Dm7/C"),{notes:[60,62,65,69],labels:["C4","D4","F4","A4"]});
});

test("diminished passing chords retain the flat fifth and diminished seventh",()=>{
  assert.deepEqual(pianoChord("Cdim"),{notes:[48,51,54],labels:["C3","E♭3","G♭3"]});
  assert.deepEqual(pianoChord("B♭dim7"),{notes:[58,61,64,67],labels:["B♭3","D♭4","F♭4","A♭♭4"]});
  assert.deepEqual(pianoChord("Gdim7/Bb"),{notes:[58,61,64,67],labels:["B♭3","D♭4","F♭4","G4"]});
  assert.deepEqual(pianoChord("C#dim7/Bb"),{notes:[58,61,64,67],labels:["B♭3","C♯4","E4","G4"]});
});
