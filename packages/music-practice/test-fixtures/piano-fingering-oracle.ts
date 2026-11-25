/** Independent test-only model of the current monophonic contract.
 * No production scoring, geometry or search helper is called. */
import assert from "node:assert/strict";
import type { FingerNote, PianoFinger } from "../src/piano-fingering";
export type PianoHand = "right" | "left";
const whites = [0, 2, 4, 5, 7, 9, 11];
function key(midi: number) {
  const pc = midi % 12,
    below = whites.filter((p) => p < pc).length;
  return (
    Math.floor(midi / 12) * 7 + (whites.includes(pc) ? below : below - 1 + 0.6)
  );
}
type Pose = { finger: number; anchor: number };
function local(n: FingerNote, s: Pose, hand: PianoHand) {
  assert.ok(s.finger >= 1 && s.finger <= 5 && Number.isInteger(s.finger));
  assert.ok(Number.isInteger(s.anchor));
  if (n.finger !== undefined)
    assert.equal(s.finger, n.finger, "fixed finger is a hard constraint");
  const extension = Math.abs(
    key(n.midi) - s.anchor - (hand === "right" ? 1 : -1) * (s.finger - 1),
  );
  assert.ok(extension <= 0.61);
  return (
    extension ** 2 * 3 +
    (!whites.includes(n.midi % 12)
      ? s.finger === 1
        ? 1.8
        : s.finger === 5
          ? 0.4
          : 0
      : 0) +
    (s.finger === 4 ? 0.15 : 0)
  );
}
function transition(
  a: FingerNote,
  b: FingerNote,
  x: Pose,
  y: Pose,
  hand: PianoHand,
) {
  const distance = Math.abs(y.anchor - x.anchor),
    delta = b.midi - a.midi,
    cross = delta * (y.finger - x.finger) * (hand === "right" ? 1 : -1) < 0;
  if (
    b.tied &&
    (b.midi !== a.midi || b.restBefore || y.finger !== x.finger || distance)
  )
    return Infinity;
  if (cross && !distance) return Infinity;
  const opportunity = b.restBefore ? 0.3 : a.duration >= 0.5 ? 0.65 : 1;
  let cost = distance ? (5 + distance * 1.8) * opportunity : 0;
  if (cross && x.finger !== 1 && y.finger !== 1) cost += 8 * opportunity;
  if (delta && x.finger === y.finger) cost += 4 * opportunity;
  if (!delta && x.finger !== y.finger) cost += 4;
  if (cross && (x.finger === 1 || y.finger === 1)) {
    const over = x.finger === 1 ? y.finger : x.finger;
    cost += over === 3 ? 0 : over === 4 ? 0.3 : 1;
  }
  return cost;
}
export function scorePianoReference(
  notes: readonly FingerNote[],
  result: readonly PianoFinger[],
  hand: PianoHand,
) {
  assert.equal(result.length, notes.length);
  let cost = 0;
  for (const [i, n] of notes.entries()) {
    const y = result[i];
    cost += local(n, y, hand);
    const x = result[i - 1];
    if (x) {
      const edge = transition(notes[i - 1], n, x, y, hand);
      assert.ok(Number.isFinite(edge));
      cost += edge;
    }
    const shift =
      !!x &&
      (x.anchor !== y.anchor ||
        (notes[i - 1].midi !== n.midi && x.finger === y.finger));
    assert.equal(y.shift, shift);
    const crossing =
      !!x &&
      shift &&
      Math.abs(y.anchor - x.anchor) <= 4 &&
      Math.abs(key(n.midi) - key(notes[i - 1].midi)) <= 1.6 &&
      (n.midi - notes[i - 1].midi) *
        (y.finger - x.finger) *
        (hand === "right" ? 1 : -1) <
        0 &&
      (x.finger === 1 || y.finger === 1);
    assert.equal(y.crossing, crossing);
  }
  return cost;
}
export function exhaustivePianoCost(
  notes: readonly FingerNote[],
  hand: PianoHand,
) {
  const choices = notes.map((n) => {
    const candidates: { pose: Pose; cost: number }[] = [];
    for (let finger = 1; finger <= 5; finger++)
      for (
        let anchor = Math.floor(key(n.midi)) - 6;
        anchor <= Math.ceil(key(n.midi)) + 6;
        anchor++
      ) {
        if (n.finger !== undefined && finger !== n.finger) continue;
        if (
          Math.abs(
            key(n.midi) - anchor - (hand === "right" ? 1 : -1) * (finger - 1),
          ) > 0.61
        )
          continue;
        const pose = { finger, anchor };
        candidates.push({ pose, cost: local(n, pose, hand) });
      }
    return candidates;
  });
  let best = Infinity,
    paths = 0;
  function walk(i: number, previous: Pose | undefined, cost: number) {
    if (i === notes.length) {
      paths++;
      best = Math.min(best, cost);
      return;
    }
    for (const c of choices[i]) {
      const edge = previous
        ? transition(notes[i - 1], notes[i], previous, c.pose, hand)
        : 0;
      if (Number.isFinite(edge)) walk(i + 1, c.pose, cost + c.cost + edge);
    }
  }
  walk(0, undefined, 0);
  return { cost: Number.isFinite(best) ? best : null, paths };
}
