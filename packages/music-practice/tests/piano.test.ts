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
test("staff defaults span two octaves and ignore retired name prompts", () => {
  const p = defaultProgress().profiles.piano;
  assert.deepEqual(pianoBounds(p), [60, 83]);
  assert.equal(pianoDeck(p).length, 14);
  assert.equal(acceptsPiano(pianoDeck(p)[0], 72), false);
  p.pianoPrompt = "name";
  assert.deepEqual(pianoBounds(p), [60, 83]);
  assert.equal(pianoDeck(p).length, 14);
  assert.equal(acceptsPiano(pianoDeck(p)[0], 72), false);
});
test("every key signature has reachable answers including enharmonic boundary spellings", () => {
  for (const key of KEYS) {
    const p = {
      ...defaultProgress().profiles.piano,
      key: key.id,
    };
    const [low, high] = pianoBounds(p);
    assert.ok(!isBlack(low) && !isBlack(high));
    for (const card of pianoDeck(p)) {
      const midi = pitch(card);
      assert.ok(midi >= low && midi <= high);
      assert.ok(acceptsPiano(card, midi));
      assert.ok(!acceptsPiano(card, midi + 1));
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
  const expected = structuredClone(progress);
  delete expected.profiles.piano.pianoPrompt;
  assert.deepEqual(loadProgress(JSON.stringify(progress)), expected);
  const bad = structuredClone(progress);
  bad.profiles.piano.low = "C1";
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

test("C2–B6 practice persists and grades exact MIDI pitches with a compact keyboard", () => {
  const progress = defaultProgress();
  Object.assign(progress.profiles.piano, {
    low: "C2",
    high: "B6",
  });
  const p = progress.profiles.piano;
  const cards = pianoDeck(p);
  assert.equal(cards.length, 35);
  assert.equal(pitch(cards[0]), 36);
  assert.equal(pitch(cards.at(-1)!), 95);
  assert.deepEqual(pianoBounds(p), [60, 83]);
  for (const card of cards) {
    assert.ok(acceptsPiano(card, pitch(card)));
    assert.ok(!acceptsPiano(card, pitch(card) + 12));
  }
  for (const card of [cards[0], cards.at(-1)!])
    progress.stats["piano-staff:" + card.id] = {
      attempts: 1,
      correct: 1,
      streak: 1,
      lastSeen: 1,
      due: 1,
    };
  assert.deepEqual(loadProgress(JSON.stringify(progress)), progress);
  const old = defaultProgress();
  assert.deepEqual(loadProgress(JSON.stringify(old)), old);
});
