import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signatureDeck,
  signatureAnswer,
  matchesSignature,
} from "../src/key-signatures";
import { KEYS } from "../src/model";
import { defaultProgress, loadProgress } from "../src/progress";
import { PracticeSession } from "../src/session";
test("all fifteen signatures have correctly spelled major and relative minor tonics", () => {
  const minors = [
    "A",
    "E",
    "B",
    "F♯",
    "C♯",
    "G♯",
    "D♯",
    "A♯",
    "D",
    "G",
    "C",
    "F",
    "B♭",
    "E♭",
    "A♭",
  ];
  const cards = signatureDeck("both");
  assert.equal(cards.length, 30);
  assert.equal(new Set(cards.map((c) => c.id)).size, 30);
  KEYS.forEach((key, i) => {
    assert.equal(signatureAnswer(cards[2 * i]), key.label.split(" · ")[0]);
    assert.equal(signatureAnswer(cards[2 * i + 1]), minors[i] + " minor");
    assert.equal(cards[2 * i].signature, cards[2 * i + 1].signature);
  });
  assert.equal(signatureDeck("major").length, 15);
  assert.ok(signatureDeck("minor").every((c) => c.tonality === "minor"));
});
test("key names require the signature's spelling, not merely an enharmonic tonic", () => {
  const card = signatureDeck().find((c) => c.id === "major:Db")!;
  assert.ok(matchesSignature(card, "D", -1));
  assert.ok(!matchesSignature(card, "C", 1));
});
test("signature sessions and saved preferences keep major and minor review histories separate", () => {
  const p = defaultProgress();
  p.mode = "signature";
  p.profiles.signature.signaturePractice = "minor";
  const session = new PracticeSession(signatureDeck("minor"), p, "signature:");
  session.next(() => 0);
  session.submit(true);
  assert.ok(p.stats["signature:minor:C"]);
  assert.ok(!p.stats["signature:major:C"]);
  assert.deepEqual(loadProgress(JSON.stringify(p)), p);
});

test("beginner limits filter signatures by count and kind, keeping the natural key", () => {
  assert.deepEqual(signatureDeck("major", 1).map(signatureAnswer), [
    "C major",
    "G major",
    "F major",
  ]);
  assert.deepEqual(signatureDeck("minor", 1, "sharps").map(signatureAnswer), [
    "A minor",
    "E minor",
  ]);
  assert.deepEqual(signatureDeck("major", 2, "flats").map(signatureAnswer), [
    "C major",
    "F major",
    "B♭ major",
  ]);
  assert.deepEqual(signatureDeck("both", 0).map(signatureAnswer), [
    "C major",
    "A minor",
  ]);
  const p = defaultProgress();
  assert.equal(p.profiles.signature.signatureMaxAccidentals, 1);
  p.profiles.signature.signatureMaxAccidentals = 2;
  p.profiles.signature.signatureAccidentals = "flats";
  assert.deepEqual(loadProgress(JSON.stringify(p)), p);
});
