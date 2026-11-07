import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultProgress, loadProgress } from "../src/progress";
import { KEYS } from "../src/model";
import {
  pianoDeck,
  pianoBounds,
  acceptsPiano,
  pitch,
  isBlack,
} from "../src/piano-model";
test("staff defaults span two octaves; names always use one octave", () => {
  const p = defaultProgress().profiles.piano;
  assert.deepEqual(pianoBounds(p), [60, 83]);
  assert.equal(pianoDeck(p).length, 14);
  assert.equal(acceptsPiano(pianoDeck(p)[0], 72, "staff"), false);
  p.pianoPrompt = "name";
  assert.deepEqual(pianoBounds(p), [60, 71]);
  assert.equal(pianoDeck(p).length, 7);
  assert.equal(acceptsPiano(pianoDeck(p)[0], 72, "name"), true);
});
test("every key signature has reachable answers including enharmonic boundary spellings", () => {
  for (const key of KEYS)
    for (const prompt of ["staff", "name"] as const) {
      const p = {
        ...defaultProgress().profiles.piano,
        key: key.id,
        pianoPrompt: prompt,
      };
      const [low, high] = pianoBounds(p);
      assert.ok(!isBlack(low) && !isBlack(high));
      for (const card of pianoDeck(p)) {
        const midi = prompt === "name" ? 60 + (pitch(card) % 12) : pitch(card);
        assert.ok(midi >= low && midi <= high);
        assert.ok(acceptsPiano(card, midi, prompt));
        assert.ok(!acceptsPiano(card, midi + 1, prompt));
      }
    }
});
test("piano preferences and review statistics survive reload independently of guitar", () => {
  const progress = defaultProgress();
  progress.mode = "piano";
  Object.assign(progress.profiles.piano, {
    pianoPrompt: "name",
    key: "Bb",
    low: "D4",
    high: "E5",
  });
  progress.stats["piano-name:B4:-1"] = {
    attempts: 2,
    correct: 1,
    streak: 0,
    lastSeen: 1,
    due: 0,
  };
  assert.deepEqual(loadProgress(JSON.stringify(progress)), progress);
  const bad = structuredClone(progress);
  bad.profiles.piano.low = "C3";
  assert.equal(loadProgress(JSON.stringify(bad)).profiles.piano.low, "C4");
});

test("narrow ranges keep octave landmarks and wider ranges stay near two octaves", () => {
  const p = defaultProgress().profiles.piano;
  assert.deepEqual(
    pianoBounds({ ...p, low: "B5", high: "B5", key: "Bb" }),
    [72, 83],
  );
  assert.deepEqual(pianoBounds({ ...p, low: "B3", high: "A5" }), [59, 81]);
  for (const key of KEYS) {
    const [low, high] = pianoBounds({ ...p, key: key.id });
    assert.ok(high - low <= 24, key.id);
  }
});
