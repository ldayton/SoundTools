import test from "node:test";
import assert from "node:assert/strict";
import {
  BERKLEE_SHAPES,
  berkleePositions,
  berkleeShift,
  berkleeOmissions,
} from "../src/berklee-scale-shapes";
import { relativeScale } from "../src/guitar-scales";
import {
  guitarScaleFromQuery,
  mergeGuitarScaleSettings,
  toggleRelativeScale,
} from "../src/guitar-scale-settings";

// Independently reviewed against Larsen's published chart, top to bottom,
// on 2026-11-23. Rows here run high E to low E.
// https://jenslarsen.nl/WP/wp-content/uploads/2019/09/7PS-Major-Scale.jpg
// Image SHA-256: 6dc52b3f449d7f48675d1843a84b7f541e418d5c5a41a15a1ab41b8e37e9b1f7
const diagrams = [
  [
    [1, 3, 5],
    [3, 5],
    [2, 4, 5],
    [2, 3, 5],
    [2, 3, 5],
    [1, 3, 5],
  ],
  [
    [3, 5, 7],
    [5, 6],
    [4, 5, 7],
    [3, 5, 7],
    [3, 5, 7],
    [3, 5, 7],
  ],
  [
    [5, 7, 8],
    [5, 6, 8],
    [5, 7],
    [5, 7, 9],
    [5, 7, 8],
    [5, 7, 8],
  ],
  [
    [7, 8, 10],
    [8, 10],
    [7, 9, 10],
    [7, 9, 10],
    [7, 8, 10],
    [7, 8, 10],
  ],
  [
    [8, 10, 12],
    [10, 12],
    [9, 10, 12],
    [9, 10, 12],
    [8, 10, 12],
    [8, 10, 12],
  ],
  [
    [10, 12, 13],
    [10, 12, 13],
    [10, 12],
    [10, 12, 14],
    [10, 12, 14],
    [10, 12, 13],
  ],
  [
    [12, 13, 15],
    [12, 13, 15],
    [12, 14],
    [12, 14, 15],
    [12, 14, 15],
    [12, 13, 15],
  ],
];
test("Berklee 7PS shapes 1–7 match Larsen's published chart order and every fret", () => {
  const firstPitches = [41, 43, 45, 47, 48, 50, 52]; // F G A B C D E, not degree order.
  for (const shape of BERKLEE_SHAPES) {
    const notes = berkleePositions(0, "major", shape, 0);
    assert.equal(notes[0].midi, firstPitches[shape - 1]);
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((string) =>
        notes.filter((n) => n.string === string).map((n) => n.fret),
      ),
      diagrams[shape - 1],
    );
  }
});
test("every transposed shape is 17 consecutive scale notes within the AP66 fretboard", () => {
  for (let tonic = 0; tonic < 12; tonic++)
    for (const shape of BERKLEE_SHAPES) {
      const shift = berkleeShift(tonic, "major", shape);
      const notes = berkleePositions(tonic, "major", shape, shift);
      assert.equal(notes.length, 17);
      assert.equal(new Set(notes.map((n) => n.midi)).size, 17);
      assert.ok(notes.every((n) => n.fret >= 1 && n.fret <= 18));
      const pitches = [0, 2, 4, 5, 7, 9, 11].map((n) => (n + tonic) % 12);
      const expected = [];
      for (let midi = notes[0].midi; midi <= notes.at(-1)!.midi; midi++)
        if (pitches.includes(midi % 12)) expected.push(midi);
      assert.deepEqual(
        notes.map((n) => n.midi),
        expected,
      );
    }
  assert.throws(() => berkleePositions(0, "major", 7, 12));
});
test("CAGED is the Western default while explicit Berklee choices and legacy regions survive", () => {
  assert.equal(mergeGuitarScaleSettings(undefined).shapeSet, "standard");
  const fresh = mergeGuitarScaleSettings({ tonic: 0, quality: "major" });
  assert.equal(fresh.shapeSet, "standard");
  assert.equal(guitarScaleFromQuery(new URLSearchParams("key=D"), fresh).shapeSet, "standard");
  for (const pattern of ["map", "1", "2", "3", "4", "5", "E"]) {
    const legacy = guitarScaleFromQuery(new URLSearchParams(`pattern=${pattern}`), fresh);
    assert.equal(legacy.shapeSet, "standard", `legacy ${pattern} URL stays CAGED`);
  }
  const saved = mergeGuitarScaleSettings({ ...fresh, shapeSet: "standard", pattern: "4" });
  assert.equal(mergeGuitarScaleSettings(saved).shapeSet, "standard");
  assert.equal(guitarScaleFromQuery(new URLSearchParams("key=D"), saved).shapeSet, "standard");
  for (const quality of ["minor", "major-pentatonic", "minor-pentatonic", "major-blues", "minor-blues"])
    assert.equal(mergeGuitarScaleSettings({ quality }, fresh).shapeSet, "standard");
  const berklee = mergeGuitarScaleSettings({ ...fresh, shapeSet: "hila", hilaShape: 2 });
  assert.equal(mergeGuitarScaleSettings(berklee).shapeSet, "hila");
  assert.equal(guitarScaleFromQuery(new URLSearchParams("key=D"), berklee).shapeSet, "hila");
});
test("canonical Berklee and legacy Hila bookmarks preserve the same numbered shape", () => {
  const base = { tonic: 0, quality: "major" as const, pattern: "4" as const };
  const saved = guitarScaleFromQuery(
    new URLSearchParams("set=hila&shape=7"),
    base,
  );
  assert.equal(saved.shapeSet, "hila");
  assert.equal(saved.hilaShape, 7);
  assert.equal(saved.pattern, "4");
  assert.deepEqual(guitarScaleFromQuery(new URLSearchParams("set=berklee&shape=7"), base), saved);
  assert.equal(
    mergeGuitarScaleSettings({ quality: "minor" }, saved).shapeSet,
    "hila",
  );
  assert.equal(mergeGuitarScaleSettings({ hilaShape: 99 }, saved).hilaShape, 7);
  assert.equal(
    mergeGuitarScaleSettings({ shapeSet: "standard" }, saved).pattern,
    "4",
  );
});

const formulas = {
  major:[0,2,4,5,7,9,11], minor:[0,2,3,5,7,8,10],
  "major-pentatonic":[0,2,4,7,9], "minor-pentatonic":[0,3,5,7,10],
  "major-blues":[0,2,3,4,7,9], "minor-blues":[0,3,5,6,7,10],
} as const;
test("a low-neck blues extension uses a fretted alternative instead of an unavailable open string", () => {
  // C# major's seventh region at frets 1–4 needs E4 (blue note) at B-string 5;
  // the otherwise-nearby high-E alternative is open and outside the movable set.
  const notes=berkleePositions(1,"major-blues",7,-11);
  assert.deepEqual(notes.filter(n=>n.midi===64).map(n=>[n.string,n.fret]),[[2,5]]);
  assert.ok(notes.every(n=>n.fret>=1&&n.fret<=5));
});
test("all seven regions in all keys preserve complete minor, pentatonic and blues pitch runs", () => {
  const tuning = [64,59,55,50,45,40];
  for (const quality of Object.keys(formulas) as (keyof typeof formulas)[])
    for (let tonic=0;tonic<12;tonic++) for (const shape of BERKLEE_SHAPES) {
      const shift=berkleeShift(tonic,quality,shape);
      const notes=berkleePositions(tonic,quality,shape,shift);
      const pitches=notes.map(n=>n.midi);
      const allowed=new Set(formulas[quality].map(n=>(n+tonic)%12));
      assert.equal(new Set(pitches).size,pitches.length,`${quality} ${tonic} ${shape}: no duplicate pitches`);
      assert.deepEqual(pitches,Array.from({length:Math.max(...pitches)-Math.min(...pitches)+1},(_,i)=>Math.min(...pitches)+i).filter(n=>allowed.has(n%12)),`${quality} ${tonic} ${shape}: complete ascending run`);
      assert.equal(new Set(notes.map(n=>n.string)).size,6);
      for (const n of notes) {
        assert.equal(n.midi,tuning[n.string-1]+n.fret);
        assert.ok(n.fret>=1&&n.fret<=18);
        assert.equal(n.root,n.midi%12===tonic);
      }
      const relative=relativeScale(tonic,quality);
      const relativeNotes=berkleePositions(relative.tonic,relative.quality,shape,berkleeShift(relative.tonic,relative.quality,shape,shift));
      assert.deepEqual(relativeNotes.map(n=>[n.string,n.fret,n.midi]),notes.map(n=>[n.string,n.fret,n.midi]));
      const parentQuality=quality.startsWith("major")?"major":"minor";
      const parent=berkleePositions(tonic,parentQuality,shape,shift);
      if (quality.endsWith("pentatonic")) {
        const omitted=berkleeOmissions(tonic,quality,shape,shift);
        assert.deepEqual([...notes,...omitted].map(n=>n.midi).sort((a,b)=>a-b),parent.map(n=>n.midi));
        assert.ok(omitted.every(n=>!allowed.has(n.midi%12)));
      }
      if (quality.endsWith("blues")) {
        const pentQuality=quality.startsWith("major")?"major-pentatonic":"minor-pentatonic";
        const pent=berkleePositions(tonic,pentQuality,shape,shift);
        assert.equal(pitches[0],pent[0].midi);
        assert.equal(pitches.at(-1),pent.at(-1)!.midi);
        const blue=(tonic+(quality.startsWith("major")?3:6))%12;
        assert.deepEqual(notes.filter(n=>n.midi%12!==blue).map(n=>[n.string,n.fret]),pent.map(n=>[n.string,n.fret]));
        const low=Math.min(...parent.map(n=>n.fret)),high=Math.max(...parent.map(n=>n.fret));
        assert.ok(notes.every(n=>n.fret>=low-1&&n.fret<=high+1));
      }
      const saved=mergeGuitarScaleSettings({tonic,quality,shapeSet:"hila",hilaShape:shape,pattern:"1",shift});
      const next=mergeGuitarScaleSettings(toggleRelativeScale(saved));
      assert.equal(next.shapeSet,"hila"); assert.equal(next.hilaShape,shape); assert.equal(next.shift,shift);
      assert.deepEqual(mergeGuitarScaleSettings(toggleRelativeScale(next)),saved);
    }
});
