import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import manifest from "../../../packages/music-practice/src/assets/songalong-organ/manifest.json";
import { hymnPlaybackInstrument } from "../../../packages/music-practice/src/hymn-instruments";
import { performNotes } from "../../../packages/music-practice/src/playback-performance";
import { stagedHymn } from "../../../packages/music-practice/test-fixtures/hymns";
test("explicit organ instrumentation routes this original score without changing piano/guitar choices", () => {
  assert.equal(
    hymnPlaybackInstrument({ id: "in-christ-alone-2" }, "original"),
    "organ",
  );
  assert.equal(hymnPlaybackInstrument(stagedHymn, "original"), "piano");
  assert.equal(
    hymnPlaybackInstrument({ id: "amazing-grace" }, "piano"),
    "piano",
  );
  assert.equal(
    hymnPlaybackInstrument({ id: "amazing-grace" }, "guitar-edition"),
    "guitar",
  );
});
test("organ sustains preserve written timing, with no guitar strum or string damping", () => {
  const source = [
    { pitch: 48, start: 0, duration: 16, volume: 0.8 },
    { pitch: 60, start: 1, duration: 1, volume: 0.8 },
  ];
  const notes = performNotes(source, { instrument: "organ" });
  assert.deepEqual(
    notes.map(({ pitch, start, duration }) => [pitch, start, duration]),
    [
      [48, 0, 16],
      [60, 1, 1],
    ],
  );
  assert.ok(
    notes.every(
      (note) =>
        note.string === undefined &&
        note.delay === undefined &&
        note.gain === undefined,
    ),
  );
});
test("bundled organ roots have normalized sustain audit, safe peaks and valid retained loops", () => {
  assert.equal(manifest.license, "CC0-1.0");
  assert.equal(manifest.samples.length, 16);
  for (const sample of manifest.samples) {
    const path = new URL(
      `../../../packages/music-practice/src/assets/songalong-organ/${sample.file}`,
      import.meta.url,
    );
    assert.ok(existsSync(path));
    assert.ok(sample.loopStart >= 0 && sample.loopEnd > sample.loopStart);
    assert.ok(Math.abs(sample.rmsDb - -26) < 0.05);
    assert.ok(sample.peak < 0.502);
  }
});
