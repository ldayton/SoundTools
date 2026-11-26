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
