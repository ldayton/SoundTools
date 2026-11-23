import assert from "node:assert/strict";
import test from "node:test";
import { decodeState, migrateLegacy } from "../src/durable-state";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  backingPack,
  backingRate,
  backingSemitones,
  backingSettings,
} from "../src/backing-track-model";

test("backing settings validate saved values and transposition leaves drums in tune", () => {
  assert.deepEqual(
    backingSettings({ style: "unsupported-genre", tempo: NaN }),
    {
      style: "blues",
      pattern: "standard",
      mode: "steady",
      tempo: 90,
      metronomeEnabled: false,
    },
  );
  assert.deepEqual(backingSettings({ style: "rock", tempo: 300 }), {
    style: "rock",
    pattern: "standard",
    mode: "steady",
    tempo: 180,
    metronomeEnabled: false,
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
  for (const pattern of Object.values(backingPack.patterns).flatMap((modes) =>
    Object.values(modes),
  )) {
    assert.ok(pattern.beats >= 256);
    assert.ok(pattern.events.length > 400);
    assert.ok(
      pattern.events[0].beat < 0.02,
      "starts directly on the groove, not a repeated count-in",
    );
    for (const event of pattern.events) {
      assert.ok(event.beat >= 0 && event.beat < pattern.beats);
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

test("long arrangements retain four-chord strings and a periodic dynamic return", () => {
  for (const modes of Object.values(backingPack.patterns)) {
    for (const pattern of Object.values(modes)) {
      for (const part of ["bass", "guitar"] as const) {
        const notes = pattern.events.filter((e) => e.part === part);
        assert.ok(new Set(notes.map((e) => e.note)).size >= 4);
        if (part === "guitar") assert.ok(notes.some((e) => e.duration >= 7));
        assert.ok(notes.every((e) => e.beat + e.duration < pattern.beats));
      }
      const hits = pattern.events.filter((e) => e.part === "drums");
      assert.ok(
        Math.max(...hits.map((e) => e.level)) /
          Math.min(...hits.map((e) => e.level)) >
          2,
      );
      assert.ok(
        Math.abs(hits[0].level - hits.at(-1)!.level) < 0.03,
        "no volume step at loop seam",
      );
    }
    assert.ok(modes.active.events.length > modes.steady.events.length);
  }
  assert.equal(backingSettings({ mode: "active" }).mode, "active");
});

test("backing feel and independent metronome tempo use durable activity checkpoints", () => {
  const state = migrateLegacy({});
  state.activities["backing-track"] = {
    version: 1,
    style: "rock",
    mode: "active",
    tempo: 104,
  };
  state.activities.metronome = { version: 1, tempo: 112 };
  const decoded = decodeState(JSON.parse(JSON.stringify(state)));
  assert.equal(
    backingSettings(decoded.activities["backing-track"]).mode,
    "active",
  );
  assert.equal(backingSettings(decoded.activities.metronome).tempo, 112);
});

test("backing click is opt-in and survives saved-state decoding", () => {
  assert.equal(backingSettings(undefined).metronomeEnabled, false);
  assert.equal(
    backingSettings({ metronomeEnabled: "true" }).metronomeEnabled,
    false,
  );
  const state = migrateLegacy({});
  state.activities["backing-track"] = { version: 1, metronomeEnabled: true };
  const saved = decodeState(JSON.parse(JSON.stringify(state)));
  assert.equal(
    backingSettings(saved.activities["backing-track"]).metronomeEnabled,
    true,
  );
});
