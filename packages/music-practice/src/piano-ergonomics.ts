/** Piano-specific preferences. Pair ranges use the published Parncutt span
 * categories as reference data (MIT pydactyl transcription credited in docs).
 * Semitone spans and white-key coordinates are never interchanged implicitly. */
import {
  pianoBlackKey,
  pianoKeyPosition,
  type PianoHand,
} from "./piano-hand-model";
// relaxed min/max, comfortable max, practical max, in semitones; ascending digits.
const spans: Record<string, readonly number[]> = {
  "1:2": [1, 5, 8, 10],
  "1:3": [3, 7, 10, 12],
  "1:4": [5, 9, 12, 14],
  "1:5": [7, 10, 13, 15],
  "2:3": [1, 2, 3, 5],
  "2:4": [3, 4, 5, 7],
  "2:5": [5, 6, 8, 10],
  "3:4": [1, 2, 2, 4],
  "3:5": [3, 4, 5, 7],
  "4:5": [1, 2, 3, 5],
};
export const pianoFingerOffset = (finger: number) => [0, 0, 1, 2, 3, 4][finger];
export function pianoErgonomicSingleCost(
  midi: number,
  finger: number,
  anchor: number,
  hand: PianoHand,
) {
  const stretch =
    pianoKeyPosition(midi) -
    anchor -
    (hand === "right" ? 1 : -1) * pianoFingerOffset(finger);
  return (
    3 * stretch * stretch +
    (pianoBlackKey(midi) ? (finger === 1 ? 1.8 : finger === 5 ? 0.4 : 0) : 0) +
    (finger === 4 ? 0.15 : 0)
  );
}
export function pianoPairPossible(
  midiA: number,
  fingerA: number,
  midiB: number,
  fingerB: number,
  span: number,
) {
  if (fingerA === fingerB) return midiA === midiB;
  const practical =
    spans[`${Math.min(fingerA, fingerB)}:${Math.max(fingerA, fingerB)}`][3];
  return (
    Math.abs(pianoKeyPosition(midiB) - pianoKeyPosition(midiA)) <= span &&
    Math.abs(midiB - midiA) <= (practical * span) / 7
  );
}
export function pianoPairComfort(
  midiA: number,
  fingerA: number,
  midiB: number,
  fingerB: number,
) {
  if (fingerA === fingerB) return midiA === midiB ? 0 : Infinity;
  const [min, max, comfortable] =
      spans[`${Math.min(fingerA, fingerB)}:${Math.max(fingerA, fingerB)}`],
    d = Math.abs(midiB - midiA);
  const deviation = d < min ? min - d : d > max ? d - max : 0;
  return (
    0.3 * deviation * deviation +
    (d > comfortable ? (d - comfortable) * 1.2 : 0)
  );
}
export type PianoAttackMemory = {
  id: string;
  midi: number;
  finger: number;
  voice?: string;
  end: number;
  start: number;
  isolated?: boolean;
};
/** Three attacks in one known/unambiguous melodic stream; no chord ordering. */
export function pianoContextCost(
  a: PianoAttackMemory,
  b: PianoAttackMemory,
  c: PianoAttackMemory,
) {
  if (a.voice !== b.voice || b.voice !== c.voice) return 0;
  let cost = 0;
  const unique = new Set([a.finger, b.finger, c.finger]);
  if (unique.size === 3 && [3, 4, 5].every((f) => unique.has(f))) cost += 0.6;
  if (a.midi === c.midi && a.finger !== c.finger) cost += 1;
  // Avoid a stretched outer pair when the middle attack need not pivot the hand.
  if (a.finger !== c.finger && b.finger !== 1)
    cost += 0.3 * pianoPairComfort(a.midi, a.finger, c.midi, c.finger);
  return cost;
}
export function pianoKeyDepthCost(
  a: { midi: number },
  b: { midi: number },
  from: number,
  to: number,
) {
  return (
    (from === 1 && pianoBlackKey(a.midi) && !pianoBlackKey(b.midi) ? 1.5 : 0) +
    (to === 1 && pianoBlackKey(b.midi) && !pianoBlackKey(a.midi) ? 1.5 : 0)
  );
}

/** Signed right-hand ranges, mirrored geometrically for the left hand.
 * Lower comfortable/practical values are reference data from Parncutt/pydactyl;
 * upper limits share the existing semitone table. Sequential spans are soft. */
export function pianoSignedSpan(from: number, to: number, hand: PianoHand) {
  if (from === to) return { comfortable: [0, 0], practical: [0, 0] };
  const lo = Math.min(from, to),
    hi = Math.max(from, to);
  const range = spans[`${lo}:${hi}`];
  const minimum =
    lo === 1
      ? [
          [0, 0],
          [-3, -5],
          [-2, -4],
          [-1, -3],
          [1, -1],
        ][hi - 1]
      : lo === 2 && hi === 5
        ? [2, 2]
        : [1, 1];
  const sign = (from < to ? 1 : -1) * (hand === "right" ? 1 : -1);
  return sign > 0
    ? { comfortable: [minimum[0], range[2]], practical: [minimum[1], range[3]] }
    : {
        comfortable: [-range[2], -minimum[0]],
        practical: [-range[3], -minimum[1]],
      };
}
export function pianoGestureFeatures(
  a: PianoAttackMemory,
  b: PianoAttackMemory,
  c: PianoAttackMemory,
  hand: PianoHand,
) {
  const none = {
    positionChanges: 0,
    positionSize: 0,
    completedPivot: 0,
    unstablePivot: 0,
  };
  if (
    a.isolated === false ||
    b.isolated === false ||
    c.isolated === false ||
    a.voice !== b.voice ||
    b.voice !== c.voice ||
    Math.abs(a.end - b.start) > 1e-8 ||
    Math.abs(b.end - c.start) > 1e-8
  )
    return none;
  const delta = c.midi - a.midi,
    range = pianoSignedSpan(a.finger, c.finger, hand);
  const outside = (r: number[]) => Math.max(0, r[0] - delta, delta - r[1]);
  const first = b.midi - a.midi,
    second = c.midi - b.midi;
  const monotonic = first * second > 0;
  const sign = hand === "right" ? 1 : -1;
  const crossed1 = first * (b.finger - a.finger) * sign < 0;
  const crossed2 = second * (c.finger - b.finger) * sign < 0;
  const count = +crossed1 + +crossed2;
  // Reward only a completed bounded pivot, including its natural approach/exit.
  // Pitch/finger reversal and repeated outer digits cannot earn this preference.
  const middleThumb = b.finger === 1;
  const over = middleThumb ? (crossed1 ? a.finger : c.finger) : b.finger;
  const completed =
    monotonic &&
    count === 1 &&
    (middleThumb || a.finger === 1 || c.finger === 1) &&
    over >= 2 &&
    over <= 4 &&
    a.finger !== c.finger &&
    a.finger !== b.finger &&
    b.finger !== c.finger &&
    Math.abs(first) <= 5 &&
    Math.abs(second) <= 5 &&
    Math.abs(delta) <= 9;
  return {
    positionChanges:
      outside(range.comfortable) > 0
        ? middleThumb && monotonic && outside(range.practical) > 0
          ? 2
          : 1
        : 0,
    positionSize: outside(range.comfortable),
    completedPivot: +completed,
    unstablePivot: monotonic && count === 2 ? 1 : 0,
  };
}
export function pianoGestureCost(
  a: PianoAttackMemory,
  b: PianoAttackMemory,
  c: PianoAttackMemory,
  hand: PianoHand,
) {
  const f = pianoGestureFeatures(a, b, c, hand);
  return (
    f.positionChanges +
    0.25 * f.positionSize -
    4 * f.completedPivot +
    4 * f.unstablePivot
  );
}
