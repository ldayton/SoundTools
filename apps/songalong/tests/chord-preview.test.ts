import test from "node:test";
import assert from "node:assert/strict";
import {
  chordPreviewSequence,
  chordPreviewGain,
  guitarChordTones,
} from "../../../packages/music-practice/src/chord-preview";
test("both instruments play one second of the voiced chord then isolated half-second notes in pitch order", () => {
  for (const instrument of ["piano", "guitar"] as const) {
    const notes = chordPreviewSequence(
      [{ pitch: 69 }, { pitch: 62 }, { pitch: 66 }],
      instrument,
    );
    assert.deepEqual(
      notes.map((n) => [n.pitch, n.start]),
      [
        [62, 0],
        [66, 0],
        [69, 0],
        [62, 1],
        [66, 1.5],
        [69, 2],
      ],
    );
    const release = instrument === "piano" ? 0.12 : 0.045;
    assert(
      notes.slice(0, 3).every((n) => Math.abs(n.duration + release - 1) < 1e-9),
    );
    assert(
      notes.slice(3).every((n) => Math.abs(n.duration + release - 0.5) < 1e-9),
    );
  }
});
test("guitar previews use the selected shape, omit muted strings, keep doubles, and apply capo once", () => {
  const tones = guitarChordTones([null, 3, 2, 0, 1, 0], 2);
  assert.deepEqual(tones, [
    { pitch: 50, string: 1 },
    { pitch: 54, string: 2 },
    { pitch: 57, string: 3 },
    { pitch: 62, string: 4 },
    { pitch: 66, string: 5 },
  ]);
  const sequence = chordPreviewSequence(tones, "guitar");
  assert.deepEqual(
    sequence.slice(5).map((n) => [n.pitch, n.string]),
    tones.map((n) => [n.pitch, n.string]),
  );
  assert.deepEqual(guitarChordTones([0, null, null, null, null, null], 0), [
    { pitch: 40, string: 0 },
  ]);
});

test("preview normalization matches RMS energy without exceeding the transient ceiling", () => {
  assert.equal(chordPreviewGain(0.02, 0.1), 2);
  assert.equal(chordPreviewGain(0.08, 0.4), 0.5);
  assert.equal(chordPreviewGain(0.02, 0.4), 1.125);
  assert.equal(chordPreviewGain(0, 0), 1);
  assert.throws(() => chordPreviewGain(NaN, 0.1), /Invalid preview PCM/);
});
