import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultProgress, loadProgress } from "../src/progress";
import { pianoNotation } from "../src/piano-notation";
import { pianoDeck, pitch, acceptsPiano } from "../src/piano-model";
import { KEYS, type Card } from "../src/model";
const card = (letter: Card["letter"], octave: number): Card => ({
  letter,
  octave,
  modifier: 0,
  id: `${letter}${octave}:0`,
});
test("grand standard placement and overlap practice preserve the sounding card", () => {
  const p = defaultProgress().profiles.piano;
  assert.equal(p.staffLayout, "grand");
  for (const [c, clef] of [
    [card("A", 3), "bass"],
    [card("B", 3), "bass"],
    [card("C", 4), "treble"],
    [card("D", 4), "treble"],
    [card("E", 4), "treble"],
  ] as const) {
    assert.equal(pianoNotation(c, p, () => 0).clef, clef);
    const both = { ...p, overlapPractice: "both" as const };
    const alternate = pianoNotation(c, both, () => 0);
    assert.equal(
      alternate.clef,
      pitch(c) >= 59 && pitch(c) <= 62
        ? clef === "bass"
          ? "treble"
          : "bass"
        : clef,
    );
    assert.equal(pianoNotation(c, both, () => 1).clef, clef);
    assert.deepEqual(alternate.written, c);
  }
});
test("octave signs change the written note, never grading or sounding identity", () => {
  for (const staffLayout of ["treble", "bass", "grand"] as const)
    for (const key of KEYS) {
      const p = {
        ...defaultProgress().profiles.piano,
        low: "C2",
        high: "B6",
        key: key.id,
        staffLayout,
        octavePractice: "practice" as const,
        overlapPractice: "both" as const,
      };
      for (const c of pianoDeck(p)) {
        const marked = pianoNotation(c, p, () => 0),
          ordinary = pianoNotation(c, p, () => 1);
        assert.equal(pitch(marked.written) + marked.octaveShift, pitch(c));
        assert.equal(ordinary.octaveShift, 0);
        assert.deepEqual(ordinary.written, c);
        assert.ok(acceptsPiano(c, pitch(c), "staff"));
        if (marked.octaveShift)
          assert.ok(!acceptsPiano(c, pitch(marked.written), "staff"));
        assert.equal(
          pianoNotation(c, { ...p, octavePractice: "off" }, () => 0)
            .octaveShift,
          0,
        );
      }
    }
  assert.equal(
    pianoNotation(
      card("C", 2),
      { ...defaultProgress().profiles.piano, octavePractice: "practice" },
      () => 0,
    ).written.octave,
    3,
  );
  assert.equal(
    pianoNotation(
      card("C", 6),
      { ...defaultProgress().profiles.piano, octavePractice: "practice" },
      () => 0,
    ).written.octave,
    5,
  );
});
test("new settings persist; legacy piano users retain treble, range and history", () => {
  const old = defaultProgress();
  const legacy = JSON.parse(JSON.stringify(old));
  legacy.version = 4;
  delete legacy.profiles.piano.staffLayout;
  delete legacy.profiles.piano.overlapPractice;
  delete legacy.profiles.piano.octavePractice;
  legacy.profiles.piano.low = "C2";
  legacy.profiles.piano.high = "B6";
  legacy.stats["piano-staff:C2:0"] = {
    attempts: 3,
    correct: 2,
    streak: 1,
    lastSeen: 123,
    due: 456,
  };
  const loaded = loadProgress(JSON.stringify(legacy));
  assert.equal(loaded.version, 5);
  assert.equal(loaded.profiles.piano.staffLayout, "treble");
  assert.equal(loaded.profiles.piano.low, "C2");
  assert.equal(loaded.profiles.piano.high, "B6");
  assert.deepEqual(loaded.stats, legacy.stats);
  Object.assign(loaded.profiles.piano, {
    staffLayout: "bass",
    overlapPractice: "both",
    octavePractice: "practice",
  });
  assert.deepEqual(loadProgress(JSON.stringify(loaded)), loaded);
  const corrupt = JSON.parse(JSON.stringify(loaded));
  corrupt.profiles.piano.staffLayout = "mixed";
  corrupt.profiles.piano.octavePractice = "always";
  assert.equal(
    loadProgress(JSON.stringify(corrupt)).profiles.piano.staffLayout,
    "grand",
  );
  assert.equal(
    loadProgress(JSON.stringify(corrupt)).profiles.piano.octavePractice,
    "off",
  );
});
