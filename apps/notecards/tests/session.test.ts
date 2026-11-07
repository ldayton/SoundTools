import { test } from "node:test";
import assert from "node:assert/strict";
import { PracticeSession } from "../src/session";
import { defaultProgress } from "../src/progress";
import { type Card, type Letter } from "../src/model";
function pool(n: number): Card[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    letter: "C" as Letter,
    octave: 3,
    modifier: 0,
  }));
}
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
test("small sets always retain every non-immediate candidate, even after repeated misses", () => {
  for (const n of [3, 4, 5, 9, 40]) {
    const s = new PracticeSession(pool(n), defaultProgress(), "name:");
    const random = rng(n);
    for (let i = 0; i < 96; i++) {
      if (s.complete) assert.ok(s.continueRound());
      const c = s.next(random)!;
      s.submit(i % 3 === 0);
      const choices = s.choices();
      assert.equal(choices.length, n - 1);
      assert.ok(!choices.some((v) => v.card.id === c.id));
      assert.ok(
        choices.every((v) => v.weight > 0 && Number.isFinite(v.weight)),
      );
    }
  }
});
test("one- and two-card sets remain valid, including the unavoidable two-card alternation", () => {
  for (const n of [1, 2]) {
    const s = new PracticeSession(pool(n), defaultProgress(), "name:");
    const ids = [];
    for (let i = 0; i < 48; i++) {
      if (s.complete) s.continueRound();
      ids.push(s.next(rng(i))!.id);
      s.submit(true);
    }
    if (n === 1) assert.ok(ids.every((id) => id === "0"));
    else
      for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1]);
  }
});
test("coverage favors neglected cards and bounded mistake boosts leave alternatives available", () => {
  const p = defaultProgress(),
    s = new PracticeSession(pool(4), p, "name:");
  const first = s.next(() => 0)!;
  s.submit(false);
  const second = s.next(() => 0)!;
  s.submit(true);
  const weights = s.choices();
  const unseen = weights.find(
    (c) => c.card.id !== first.id && c.card.id !== second.id,
  )!;
  assert.ok(
    unseen.weight > weights.find((c) => c.card.id === first.id)!.weight,
  );
  for (let i = 0; i < 2; i++) {
    s.next(() => 0.99);
    s.submit(true);
  }
  assert.equal(s.choices().length, 3);
  assert.ok(s.choices().every((c) => c.weight <= 12));
});
test("continuation retains recency and coverage while resetting score and settings start afresh", () => {
  const p = defaultProgress(),
    cards = pool(4),
    s = new PracticeSession(cards, p, "name:");
  assert.equal(s.continueRound(), false);
  for (let i = 0; i < 12; i++) {
    s.next(rng(i));
    s.submit(true);
  }
  const last = s.recent.at(-1),
    before = s.choices(1000);
  assert.ok(s.continueRound());
  assert.equal(s.answered, 0);
  assert.equal(s.correct, 0);
  assert.deepEqual(s.choices(1000), before);
  assert.notEqual(s.next(() => 0)!.id, last);
  const fresh = new PracticeSession(cards, p, "name:");
  assert.equal(fresh.choices().length, 4);
});
test("seeded simulations avoid forced cycles, cover the set, and do not let weak cards dominate", () => {
  for (const n of [3, 4, 5, 12, 40]) {
    let cycles = 0;
    const aggregate = Array(n).fill(0);
    for (let seed = 1; seed <= 100; seed++) {
      const p = defaultProgress(),
        s = new PracticeSession(pool(n), p, "name:");
      const random = rng(seed),
        ids: number[] = [];
      for (let i = 0; i < 240; i++) {
        if (s.complete) s.continueRound();
        const c = s.next(random)!;
        const id = Number(c.id);
        ids.push(id);
        aggregate[id]++;
        s.submit(id !== 0);
      }
      assert.equal(new Set(ids).size, n, `coverage n=${n}, seed=${seed}`);
      if (ids.slice(40).every((id, i, seq) => i < n || id === seq[i - n]))
        cycles++;
    }
    assert.equal(cycles, 0, `no locked ${n}-card cycles`);
    assert.ok(aggregate[0] < 24000 * 0.5, "weak card does not dominate");
    assert.ok(aggregate.every((count) => count > 0));
  }
});

test("round boundaries do not change the practice sequence or mistake revisits", () => {
  const sequences: string[][] = [];
  for (const length of [12, 24, 36, 48] as const) {
    const p = defaultProgress();
    p.roundLength = length;
    const s = new PracticeSession(pool(5), p, "name:");
    const random = rng(917),
      ids: string[] = [];
    for (let i = 0; i < 144; i++) {
      if (s.complete) s.continueRound();
      const card = s.next(random)!;
      ids.push(card.id);
      s.submit(i % 4 !== 0);
    }
    sequences.push(ids);
  }
  for (const sequence of sequences) assert.deepEqual(sequence, sequences[0]);
});
