// SPDX-License-Identifier: AGPL-3.0-or-later
// TypeScript port of vibetuned/chirality's Parncutt rules, revision
// cd9c54e0dcdfaf0677690f03978cd23ecd90da22. See LICENSE and README.md.
import { pianoBlackKey, type PianoHand } from "../../src/piano-hand-model";

export const parncuttRuleKeys = [
  "str",
  "sma",
  "lar",
  "pcc",
  "pcs",
  "wea",
  "345",
  "3t4",
  "bl4",
  "bl1",
  "bl5",
  "pa1",
] as const;
export type ParncuttRule = (typeof parncuttRuleKeys)[number];
export type ParncuttFeatures = Record<ParncuttRule, number>;
export type ParncuttWeights = Readonly<ParncuttFeatures>;
export type PianoDigit = 1 | 2 | 3 | 4 | 5;
export type ParncuttAttack = Readonly<{ midi: number; finger: PianoDigit }>;
export const parncuttZeroFeatures = (): ParncuttFeatures => ({
  str: 0,
  sma: 0,
  lar: 0,
  pcc: 0,
  pcs: 0,
  wea: 0,
  "345": 0,
  "3t4": 0,
  bl4: 0,
  bl1: 0,
  bl5: 0,
  pa1: 0,
});
export const parncuttUniformWeights: ParncuttWeights = Object.freeze(
  Object.fromEntries(parncuttRuleKeys.map((k) => [k, 1])) as ParncuttFeatures,
);
export const parncuttDot = (
  features: ParncuttFeatures,
  weights: ParncuttWeights,
) => parncuttRuleKeys.reduce((sum, k) => sum + features[k] * weights[k], 0);
export function addParncuttFeatures(
  target: ParncuttFeatures,
  source: ParncuttFeatures,
) {
  for (const k of parncuttRuleKeys) target[k] += source[k];
}

// MinPrac, MinComf, MinRel, MaxRel, MaxComf, MaxPrac, semitones.
// Ordered descending pairs use the reversed, negated ascending bounds.
const ranges: Readonly<Record<string, readonly number[]>> = {
  "1:2": [-5, -3, 1, 5, 8, 10],
  "1:3": [-4, -2, 3, 7, 10, 12],
  "1:4": [-3, -1, 5, 9, 12, 14],
  "1:5": [-1, 1, 7, 10, 13, 15],
  "2:3": [1, 1, 1, 2, 3, 5],
  "2:4": [1, 1, 3, 4, 5, 7],
  "2:5": [2, 2, 5, 6, 8, 10],
  "3:4": [1, 1, 1, 2, 2, 4],
  "3:5": [1, 1, 3, 4, 5, 7],
  "4:5": [1, 1, 1, 2, 3, 5],
};
const orderedRanges = Object.freeze(
  Array.from({ length: 25 }, (_, i) => {
    const from = Math.floor(i / 5) + 1,
      to = (i % 5) + 1;
    const row =
      from === to
        ? [0, 0, 0, 0, 0, 0]
        : ranges[`${Math.min(from, to)}:${Math.max(from, to)}`];
    return Object.freeze(
      from <= to ? [...row] : [...row].reverse().map((v) => -v),
    );
  }),
);
export function parncuttSpanLimits(
  from: PianoDigit,
  to: PianoDigit,
): readonly number[] {
  return orderedRanges[(from - 1) * 5 + to - 1];
}
const interval = (a: number, b: number, hand: PianoHand) =>
  (b - a) * (hand === "right" ? 1 : -1);
export function parncuttNativeTransition(
  a: ParncuttAttack,
  b: ParncuttAttack,
  hand: PianoHand,
) {
  const d = interval(a.midi, b.midi, hand),
    r = parncuttSpanLimits(a.finger, b.finger);
  return d >= r[0] && d <= r[5];
}
export function parncuttNoteFeatures(
  midi: number,
  finger: PianoDigit,
  previous?: number,
  next?: number,
): ParncuttFeatures {
  const f = parncuttZeroFeatures(),
    black = pianoBlackKey(midi);
  f.wea = +(finger === 4 || finger === 5);
  const neighbours =
    +(previous !== undefined && !pianoBlackKey(previous)) +
    +(next !== undefined && !pianoBlackKey(next));
  if (black && finger === 1) f.bl1 = 1 + 2 * neighbours;
  if (black && finger === 5) f.bl5 = 2 * neighbours;
  return f;
}
export function parncuttPairFeatures(
  a: ParncuttAttack,
  b: ParncuttAttack,
  hand: PianoHand,
): ParncuttFeatures {
  const f = parncuttZeroFeatures(),
    d = interval(a.midi, b.midi, hand),
    r = parncuttSpanLimits(a.finger, b.finger);
  const thumb = a.finger === 1 || b.finger === 1,
    multiplier = thumb ? 1 : 2;
  f.str = 2 * Math.max(0, r[1] - d, d - r[4]);
  const small = multiplier * Math.max(0, r[2] - d),
    large = multiplier * Math.max(0, d - r[3]);
  f.sma = a.finger > b.finger ? large : small;
  f.lar = a.finger > b.finger ? small : large;
  f["3t4"] = +(a.finger === 3 && b.finger === 4);
  const ab = pianoBlackKey(a.midi),
    bb = pianoBlackKey(b.midi);
  if ((a.finger === 3 && b.finger === 4) || (a.finger === 4 && b.finger === 3))
    f.bl4 = +(a.finger === 4 ? ab && !bb : bb && !ab);
  if (thumb && a.finger !== b.finger && d * (b.finger - a.finger) < 0)
    f.pa1 = ab === bb ? 1 : (a.finger === 1 ? ab : bb) ? 3 : 0;
  return f;
}
export function parncuttTripleFeatures(
  a: ParncuttAttack,
  b: ParncuttAttack,
  c: ParncuttAttack,
  hand: PianoHand,
): ParncuttFeatures {
  const f = parncuttZeroFeatures(),
    d = interval(a.midi, c.midi, hand),
    r = parncuttSpanLimits(a.finger, c.finger);
  if (!d) f.pcc = +(a.finger !== c.finger);
  else if (d < r[1] || d > r[4]) {
    const between =
      Math.min(a.midi, c.midi) < b.midi && b.midi < Math.max(a.midi, c.midi);
    f.pcc = b.finger === 1 && between && (d < r[0] || d > r[5]) ? 2 : 1;
  }
  f.pcs = d === 0 ? 0 : Math.max(0, r[1] - d, d - r[4]);
  f["345"] = +(
    [a.finger, b.finger, c.finger].every((x) => x >= 3) &&
    new Set([a.finger, b.finger, c.finger]).size === 3
  );
  return f;
}
