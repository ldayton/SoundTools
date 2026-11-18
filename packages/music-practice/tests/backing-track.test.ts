import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  backingPack,
  backingRate,
  backingSemitones,
  backingSettings,
} from "../src/backing-track-model";

test("backing settings validate saved values and transposition leaves drums in tune", () => {
  assert.deepEqual(backingSettings({ style: "folk", tempo: NaN }), {
    style: "blues",
    tempo: 90,
  });
  assert.deepEqual(backingSettings({ style: "rock", tempo: 300 }), {
    style: "rock",
    tempo: 180,
  });
  assert.equal(backingSettings({ tempo: 1 }).tempo, 50);
  assert.equal(backingSemitones(9), 0);
  assert.equal(backingSemitones(0), 3);
  assert.equal(backingSemitones(4), -5);
  for (let tonic = 0; tonic < 12; tonic++) {
    assert.equal(backingRate("drums", tonic), 1);
    assert.equal(backingRate("percussion", tonic), 1);
    assert.equal(backingRate("bass", tonic), backingRate("guitar", tonic));
    assert.ok(Math.abs(backingSemitones(tonic)) <= 6);
  }
});

test("both loop arrangements have recorded samples for every note and release", () => {
  const samples = Object.values(backingPack.samples);
  assert.deepEqual(Object.keys(backingPack.patterns), ["blues", "rock"]);
  for (const pattern of Object.values(backingPack.patterns)) {
    assert.equal(pattern.beats, 96);
    assert.ok(pattern.events.length > 400);
    assert.ok(
      pattern.events[0].beat < 0.02,
      "starts directly on the groove, not a repeated count-in",
    );
    for (const event of pattern.events) {
      assert.ok(event.beat >= 0 && event.beat < 96);
      assert.ok(
        samples.some(
          (s) => s.part === event.part && s.note === event.note && !s.release,
        ),
      );
      if (event.part === "bass" || event.part === "guitar")
        assert.ok(
          samples.some(
            (s) => s.part === event.part && s.note === event.note && s.release,
          ),
        );
    }
  }
  for (const sample of samples) {
    const path = fileURLToPath(
      new URL(`../src/assets/backing-v1/${sample.file}`, import.meta.url),
    );
    assert.equal(readFileSync(path).subarray(0, 4).toString(), "fLaC");
  }
  assert.ok(backingPack.levels.bass < 0.1, "approved -12dB bass balance");
  assert.ok(backingPack.levels.guitar < 0.4, "approved -12dB guitar balance");
});
