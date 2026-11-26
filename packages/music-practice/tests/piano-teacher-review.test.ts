import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import {
  blindReviewOrder,
  reviewMethods,
  removeReviewVoice,
  reviewAbc,
  passageFingerprint,
} from "../test-fixtures/piano-teacher-review";
test("blind assignments are deterministic, balanced and include each method once", () => {
  const orders = Array.from({ length: 6 }, (_, i) =>
    blindReviewOrder(i, "frozen-seed"),
  );
  assert.equal(new Set(orders.map((o) => o.join())).size, 6);
  for (const order of orders)
    assert.deepEqual([...order].sort(), [...reviewMethods].sort());
  for (let col = 0; col < 3; col++)
    for (const method of reviewMethods)
      assert.equal(orders.filter((o) => o[col] === method).length, 2);
  assert.deepEqual(
    blindReviewOrder(7, "frozen-seed"),
    blindReviewOrder(1, "frozen-seed"),
  );
  assert.throws(() => blindReviewOrder(-1, "seed"));
});
test("singer removal preserves all instrumental voice notes and durations on a shared staff", () => {
  const source =
    "X:1\nM:4/4\nL:1/4\n%%score (v0 v1) | v2\nV:v0 clef=treble\nV:v1 clef=treble\nV:v2 clef=bass\nK:C\n[V:v0] c4 |]\nw:word\n[V:v1] [CE]2 G2 |]\n[V:v2] C,4 |]";
  const notes = (abc: string) =>
    abcjs
      .parseOnly(abc)[0]
      .setUpAudio({ chordsOff: true })
      .tracks.map((t) =>
        t
          .filter((e) => e.cmd === "note")
          .map((e) => [e.pitch, e.start, e.duration]),
      );
  const removed = removeReviewVoice(source, "v0");
  assert.deepEqual(notes(removed), notes(source).slice(1));
  assert.ok(!removed.includes("v0"));
  assert.ok(!removed.includes("word"));
  assert.throws(() => removeReviewVoice(source, "missing"));
});
test("unmarked notation removes digits and lyrics without changing written music", () => {
  const abc = "X:1\nT:Title\nM:4/4\nL:1/4\nK:C\n!1!C !2!D E2 |]\nw:words\n";
  const clean = reviewAbc(abc);
  const pitches = (a: string) =>
    abcjs
      .parseOnly(a)[0]
      .setUpAudio({ chordsOff: true })
      .tracks.map((t) =>
        t
          .filter((e) => e.cmd === "note")
          .map((e) => [e.pitch, e.start, e.duration]),
      );
  assert.deepEqual(pitches(clean), pitches(abc));
  assert.ok(!clean.includes("!1!"));
  assert.ok(!clean.includes("words"));
  const ns = [
    { hand: "right", midi: 60, start: 0, duration: 1 },
    { hand: "left", midi: 48, start: 0, duration: 2 },
  ];
  assert.equal(passageFingerprint(ns), passageFingerprint([...ns].reverse()));
  assert.notEqual(
    passageFingerprint(ns),
    passageFingerprint(ns.map((n) => ({ ...n, duration: n.duration + 1 }))),
  );
});
