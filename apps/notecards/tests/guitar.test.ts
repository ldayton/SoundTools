import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guitarDeck,
  guitarQuestions,
  midiAt,
  spellPitch,
  acceptsLocation,
  MODES,
  STRINGS,
  type Profile,
} from "../src/guitar";
import { KEYS, matches, deck } from "../src/model";
import { defaultProgress, loadProgress, recordAnswer } from "../src/progress";
import { PracticeSession } from "../src/session";
const profile: Profile = {
  low: "E3",
  high: "F4",
  key: "C",
  strings: [6],
  minFret: 0,
  maxFret: 5,
};
test("standard tuning, semitone steps, B-string interval and octave repetition", () => {
  assert.deepEqual(
    STRINGS.map((s) => midiAt(s.number, 0)),
    [64, 59, 55, 50, 45, 40],
  );
  assert.equal(midiAt(3, 0) - midiAt(2, 0), -4);
  for (const s of STRINGS)
    for (let fret = 0; fret <= 12; fret++) {
      assert.equal(midiAt(s.number, fret), s.midi + fret);
      if (fret === 12)
        assert.equal(midiAt(s.number, fret) - midiAt(s.number, 0), 12);
    }
  for (const [string, fret] of [
    [0, 0],
    [7, 0],
    [1, -1],
    [1, 13],
    [1, 1.5],
  ])
    assert.throws(() => midiAt(string, fret));
});
test("every key and guitar location generates consistent sounding and written pitch", () => {
  for (const key of KEYS) {
    const cards = guitarDeck({
      ...profile,
      key: key.id,
      strings: [1, 2, 3, 4, 5, 6],
      minFret: 0,
      maxFret: 12,
    });
    assert.ok(cards.length > 0);
    assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
    for (const card of cards) {
      assert.equal(midiAt(card.string, card.fret), card.midi);
      assert.ok(matches(card, card.letter, card.modifier));
      assert.ok(acceptsLocation(card, card.string, card.fret, true));
      assert.ok(card.fret >= 0 && card.fret <= 12);
    }
    for (const string of STRINGS)
      for (let fret = 0; fret <= 12; fret++)
        assert.equal(
          !!spellPitch(midiAt(string.number, fret), key.id),
          cards.some((c) => c.string === string.number && c.fret === fret),
        );
  }
  assert.deepEqual(
    guitarDeck(profile).map((c) => [c.fret, c.letter]),
    [
      [0, "E"],
      [1, "F"],
      [3, "G"],
      [5, "A"],
    ],
  );
  assert.equal(spellPitch(60, "C#")!.letter, "B");
  assert.equal(spellPitch(60, "C#")!.octave, 3);
  assert.equal(spellPitch(59, "Cb")!.letter, "C");
  assert.equal(spellPitch(59, "Cb")!.octave, 4);
});
test("find accepts octave-equivalent locations but staff-to-fretboard requires exact octave", () => {
  const e = guitarDeck(profile)[0];
  assert.ok(acceptsLocation(e, 6, 12, false));
  assert.ok(!acceptsLocation(e, 6, 12, true));
  assert.ok(!acceptsLocation(e, 1, 0, false));
  assert.deepEqual(
    guitarDeck({ ...profile, minFret: 1, maxFret: 1, key: "G" }),
    [],
  );
  assert.throws(() => guitarDeck({ ...profile, strings: [] }));
});
test("progress keeps profiles and stats separate, migrates old staff history, rejects damaged data", () => {
  const old = loadProgress(
    JSON.stringify({
      version: 2,
      settings: { low: "E3", high: "F4", key: "F" },
      stats: { "E3:0": { attempts: 4, correct: 3 } },
    }),
  );
  assert.equal(old.mode, "staff");
  assert.equal(old.profiles.staff.key, "F");
  assert.equal(old.stats["staff:E3:0"].correct, 3);
  const p = defaultProgress();
  p.profiles.name.maxFret = 12;
  assert.equal(p.profiles.find.maxFret, 5);
  recordAnswer(p, "name:6:0", true, 1000);
  assert.equal(p.stats["name:6:0"].due, 86401000);
  assert.equal(p.stats["find:6:0"], undefined);
  assert.equal(loadProgress("broken").mode, "staff");
  const damaged = loadProgress(
    JSON.stringify({
      version: 3,
      mode: "unknown",
      profiles: {
        name: { strings: [0, 8, "6"], minFret: -1, maxFret: 100, key: "H" },
      },
      stats: { "find:6:90": { attempts: 1, correct: 1 } },
    }),
  );
  assert.deepEqual(damaged, defaultProgress());
  assert.deepEqual(loadProgress(JSON.stringify(p)), p);
});
test("session guards duplicate answers, spaces mistakes, handles one-note sets and completes exactly 12", () => {
  const p = defaultProgress(),
    pool = guitarDeck(profile),
    s = new PracticeSession(pool, p, "name:");
  const first = s.next(() => 0)!;
  assert.equal(first.fret, 0);
  assert.ok(s.submit(false));
  assert.ok(!s.submit(true));
  for (let i = 0; i < 3; i++) {
    assert.notEqual(s.next(() => 0)!.id, first.id);
    s.submit(true);
  }
  assert.equal(s.next(() => 0)!.id, first.id);
  s.submit(true);
  while (!s.complete) {
    s.next(() => 0);
    s.submit(true);
  }
  assert.equal(s.answered, 12);
  assert.equal(s.correct, 11);
  assert.equal(s.next(), null);
  const single = new PracticeSession([pool[0]], p, "find:");
  for (let i = 0; i < 12; i++) {
    assert.ok(single.next());
    assert.ok(single.submit(true));
  }
  assert.equal(single.next(), null);
  for (const mode of MODES) {
    const cards = mode.id === "staff" ? deck(p.profiles.staff) : pool;
    assert.ok(cards.length);
  }
});

test("find prompts are unique by string and pitch class across octave-equivalent frets", () => {
  const p = { ...profile, maxFret: 12 };
  const questions = guitarQuestions("find", p);
  assert.equal(questions.filter((c) => c.letter === "E").length, 1);
  assert.equal(
    guitarQuestions("name", p).filter((c) => c.letter === "E").length,
    2,
  );
  assert.equal(
    new Set(questions.map((c) => `${c.string}:${c.midi % 12}`)).size,
    questions.length,
  );
});

test("all round lengths complete at their selected count and survive storage", () => {
  for (const length of [12, 24, 36, 48] as const) {
    const p = defaultProgress();
    p.roundLength = length;
    assert.equal(loadProgress(JSON.stringify(p)).roundLength, length);
    const s = new PracticeSession(guitarDeck(profile), p, "name:");
    for (let i = 0; i < length; i++) {
      assert.equal(s.complete, false);
      assert.ok(s.next(() => 0));
      assert.ok(s.submit(true));
    }
    assert.equal(s.complete, true);
    assert.equal(s.answered, length);
    assert.equal(s.next(), null);
  }
  assert.equal(
    loadProgress(JSON.stringify({ version: 3, roundLength: 13 })).roundLength,
    12,
  );
});
