import { test } from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import {
  pitchLabel,
  feedbackForNotes,
  scoreSpellings,
} from "../src/sight-feedback";
import { WaitForMe } from "../src/sight-reading-model";

test("feedback names played and expected octaves, including octave mistakes", () => {
  assert.equal(
    feedbackForNotes(74, [69], [], "wrong"),
    "You played D5; play A4.",
  );
  assert.equal(
    feedbackForNotes(81, [69], [], "wrong"),
    "You played A5; play A4.",
  );
  assert.equal(pitchLabel(61), "C♯4 / D♭4");
});
test("score spelling preserves explicit accidentals, enharmonics and octave boundaries", () => {
  const tune = abcjs.parseOnly("X:1\nL:1/4\nK:C\n^B _c ^F _G =F |")[0];
  tune.setUpAudio({});
  const labels = [...scoreSpellings(tune).values()].flatMap((m) =>
    Object.entries(m),
  );
  assert.deepEqual(labels, [
    ["72", "B♯4"],
    ["71", "C♭5"],
    ["66", "F♯4"],
    ["66", "G♭4"],
    ["65", "F4"],
  ]);
  assert.equal(
    feedbackForNotes(66, [71], [], "wrong", { 71: "C♭5", 66: "G♭4" }),
    "You played G♭4; play C♭5.",
  );
});
test("partial chords name remaining fresh held notes without calling them wrong; extras stay distinct", () => {
  const session = new WaitForMe([{ pitches: [60, 64, 67] }]);
  assert.equal(session.answer(60, [60]), "partial");
  assert.equal(
    feedbackForNotes(
      60,
      session.current.pitches,
      session.selected,
      "partial",
      {},
      [60],
    ),
    "You played C4; add E4 and G4.",
  );
  assert.equal(session.answer(66, [60, 66]), "wrong");
  assert.equal(
    feedbackForNotes(
      66,
      session.current.pitches,
      session.selected,
      "wrong",
      {},
      [60, 66],
    ),
    "You played F♯4 / G♭4; that note is extra. Still play E4 and G4.",
  );
  assert.equal(session.answer(64, [64]), "partial");
  assert.equal(
    feedbackForNotes(
      64,
      session.current.pitches,
      session.selected,
      "partial",
      {},
      [64],
    ),
    "You played E4; add C4 and G4.",
  );
  assert.equal(session.answer(67, [60, 64, 67]), "complete");
});
