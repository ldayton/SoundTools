import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import { WaitForMe } from "../src/sight-reading-model";
import { eventSteps, tiedContinuations } from "../src/practice-score";
import {
  mergeHymnSettings,
  hymnSettingsFromQuery,
  type HymnSettings,
} from "../src/hymn-settings";
const steps = [
  { pitches: [48, 64], retryPitches: [48, 64] },
  { pitches: [65], retryPitches: [65, 48] },
];
test("normal forward progress does not demand another bass attack", () => {
  const s = new WaitForMe(steps);
  assert.equal(s.answer(48, [48]), "partial");
  assert.equal(s.answer(64, [48, 64]), "advanced");
  assert.deepEqual(s.current.pitches, [65]);
  assert.equal(s.answer(65, [48, 65]), "complete");
});
test("after a wrong melody attack, both the melody and sustained bass need fresh attacks held together", () => {
  const s = new WaitForMe(steps);
  s.answer(48, [48]);
  s.answer(64, [48, 64]);
  assert.equal(s.answer(66, [48, 66]), "wrong");
  assert.deepEqual(s.current.pitches, [65, 48]);
  assert.equal(s.answer(65, [48, 65]), "partial");
  assert.equal(s.answer(48, [48, 65]), "complete");
});
test("wrong notes discard partial chord credit and interrupted or resumed passages recover carried notes", () => {
  const s = new WaitForMe(steps);
  s.answer(48, [48]);
  s.answer(66, [48, 66]);
  assert.deepEqual(s.selected, []);
  assert.equal(s.answer(64, [48, 64]), "partial");
  assert.equal(s.answer(48, [48, 64]), "advanced");
  s.resetGesture();
  assert.deepEqual(s.current.pitches, [65, 48]);
  assert.equal(s.answer(65, [48, 65]), "partial");
  assert.equal(s.answer(48, [48, 65]), "complete");
  const restored = new WaitForMe(steps, 1);
  assert.deepEqual(restored.current.pitches, [65, 48]);
});
test("only the practised score contributes recovery notes", () => {
  const events = [
    { milliseconds: 0, midiPitches: [{ pitch: 64 }], sustainedPitches: [48] },
  ] as any;
  assert.deepEqual(eventSteps(events, true), [
    { pitches: [64], retryPitches: [64, 48] },
  ]);
  assert.deepEqual(eventSteps(events), [{ pitches: [64] }]);
});
test("tied continuations retain key-signature pitch, octave and transposition without changing the original ties", () => {
  const tune = abcjs.parseOnly("X:1\nM:4/4\nL:1/4\nK:Bb\nB2-B c | d4 |")[0];
  tune.setUpAudio({ midiTranspose: 12 });
  const map = tiedContinuations(tune);
  assert.deepEqual(
    [...map.values()].map((p) => p.map((n) => n.pitch)),
    [[82]],
  );
  const notes = tune.lines
    .flatMap((l) => l.staff || [])
    .flatMap((s) => s.voices)
    .flat()
    .filter((n) => n?.el_type === "note");
  assert.ok(notes[0].pitches?.[0].startTie);
  assert.ok(notes[1].pitches?.[0].endTie);
});
test("re-striking tied notes is optional, validated, and shareable", () => {
  const base: HymnSettings = {
    hymn: "amazing-grace",
    arrangement: "melody",
    sectionBars: 0,
    section: 0,
    position: 0,
  };
  assert.equal(
    mergeHymnSettings(base, { reattackTies: "yes" }).reattackTies,
    false,
  );
  assert.equal(
    hymnSettingsFromQuery(base, new URLSearchParams("ties=repeat"))
      .reattackTies,
    true,
  );
  assert.equal(
    hymnSettingsFromQuery(
      { ...base, reattackTies: true },
      new URLSearchParams("ties=hold"),
    ).reattackTies,
    false,
  );
});
