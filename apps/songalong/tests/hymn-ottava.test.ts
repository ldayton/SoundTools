import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  SOURCE_VARIANTS,
  arrangeHymn,
} from "../../../packages/music-practice/src/hymn-arrangements";
import { initialHymnSignatures } from "../../../packages/music-practice/src/hymn-signatures";
import { applyHymnOttava } from "../../../packages/music-practice/src/hymn-ottava";
import { scoreSpellings } from "../../../packages/music-practice/src/sight-feedback";
import { tiedContinuations } from "../../../packages/music-practice/src/practice-score";

const notes = (tune: ReturnType<typeof abcjs.parseOnly>[0]) =>
  tune.lines
    .flatMap((line) => line.staff || [])
    .flatMap((staff) => staff.voices || [])
    .flat()
    .filter((item) => item.el_type === "note");
const geometry = (tune: ReturnType<typeof abcjs.parseOnly>[0]) =>
  notes(tune).map((note) => note.pitches?.map((pitch) => pitch.verticalPos));

test("low hymn parts use stable octave clef marks while keeping treble and bass clefs", () => {
  const hymn = hymns.find((h) => h.slug === "amazing-grace")!;
  const abc = arrangeHymn(hymn, "bass", 0, 0, "both").abc;
  const tune = abcjs.parseOnly(abc, { visualTranspose: -8 })[0];
  const before = geometry(tune);
  const clefs = tune.lines
    .flatMap((line) => line.staff || [])
    .map((staff) => staff.clef?.type);
  const marks = applyHymnOttava(tune);
  assert.ok(marks.length > 0);
  assert.ok(marks.every((mark) => mark.label === "8" && mark.octaves === 1));
  assert.deepEqual(
    tune.lines
      .flatMap((line) => line.staff || [])
      .map((staff) => staff.clef?.type),
    clefs,
  );
  const after = geometry(tune);
  assert.notDeepEqual(after, before);
  applyHymnOttava(tune);
  assert.deepEqual(
    geometry(tune),
    after,
    "a repeated engraving callback never shifts twice",
  );
  const ordinary = abcjs.parseOnly(arrangeHymn(hymn, "melody", 0).abc)[0];
  assert.equal(applyHymnOttava(ordinary).length, 0);
  const low = abcjs.parseOnly(arrangeHymn(hymn, "melody", 0).abc, {
    visualTranspose: -20,
  })[0];
  assert.ok(applyHymnOttava(low).every((mark) => mark.label === "15"));
});

test("ottava engraving preserves every hymn's audio, spelling, ties and source-note identity", () => {
  for (const hymn of hymns)
    for (const { id } of SOURCE_VARIANTS)
      for (const transpose of [-24, -12, 0, 12]) {
        const abc = arrangeHymn(hymn, id, 0, 0, "both").abc;
        const baseline = abcjs.parseOnly(abc, {
          visualTranspose: transpose,
        })[0];
        const tune = abcjs.parseOnly(abc, { visualTranspose: transpose })[0];
        const expected = baseline.setUpAudio({
          qpm: 60,
          chordsOff: true,
          midiTranspose: transpose,
        });
        applyHymnOttava(tune);
        const restore = initialHymnSignatures(tune);
        restore();
        const actual = tune.setUpAudio({
          qpm: 60,
          chordsOff: true,
          midiTranspose: transpose,
        });
        assert.deepEqual(
          actual,
          expected,
          `${hymn.id} ${id} ${transpose} audio`,
        );
        assert.deepEqual(scoreSpellings(tune), scoreSpellings(baseline));
        assert.deepEqual(tiedContinuations(tune), tiedContinuations(baseline));
        const identity = (t: typeof tune) =>
          notes(t).map((n) => [
            n.startChar,
            n.endChar,
            n.duration,
            n.pitches?.map((p) => [
              p.pitch,
              p.name,
              p.accidental,
              p.startTie,
              p.endTie,
            ]),
          ]);
        assert.deepEqual(identity(tune), identity(baseline));
      }
});

test("repeated hymn keys are omitted for engraving without losing changed keys or audio accidentals", () => {
  const abc =
    "X:1\nM:4/4\nL:1/4\nK:B\nF G A B |\nF G A B |\nK:Bb\nB E A B |\nB E A B |]\n";
  const tune = abcjs.parseOnly(abc)[0];
  const staffs = tune.lines.flatMap((line) => line.staff || []);
  assert.equal(staffs.length, 4);
  const original = staffs.map((staff) => staff.key);
  const expected = abcjs.parseOnly(abc)[0].setUpAudio({ qpm: 60 });
  const restore = initialHymnSignatures(tune);
  assert.equal(staffs[0].key?.accidentals?.length, 5);
  assert.equal(staffs[1].key?.accidentals?.length, 0);
  assert.equal(
    staffs[2].key?.accidentals?.filter((acc) => acc.acc === "flat").length,
    2,
    "a genuine key change remains visible, including its cancellation naturals",
  );
  assert.equal(staffs[3].key?.accidentals?.length, 0);
  restore();
  staffs.forEach((staff, i) => assert.equal(staff.key, original[i]));
  assert.deepEqual(tune.setUpAudio({ qpm: 60 }), expected);
});
