/** Legacy whole-note-duration, single-voice adapter. Generated timed scores use
 * the whole-hand planner; both APIs share geometry, motion and exact search. */
import {
  assertPianoHand,
  assertPianoNote,
  pianoSinglePoses,
  pianoNoteCost,
  pianoMotionCost,
  pianoMotion,
  solvePianoPath,
} from "./piano-hand-model";
export { pianoKeyPosition } from "./piano-hand-model";
export type FingerNote = {
  midi: number;
  finger?: number;
  duration: number;
  restBefore?: boolean;
  tied?: boolean;
};
export type PianoFinger = {
  finger: number;
  anchor: number;
  shift: boolean;
  crossing: boolean;
};
export function planPianoFingering(
  notes: readonly FingerNote[],
  hand: "right" | "left",
): PianoFinger[] {
  assertPianoHand(hand);
  for (const [i, n] of notes.entries()) {
    assertPianoNote(n);
    if (n.tied && (!i || n.restBefore || n.midi !== notes[i - 1].midi))
      throw Error(
        "A piano tie must continue the preceding pitch without a rest",
      );
  }
  const layers = notes.map((n) => pianoSinglePoses(n.midi, n.finger, hand));
  const result = solvePianoPath(
    layers,
    (pose, i) => pianoNoteCost(notes[i].midi, pose.finger, pose.anchor, hand),
    (a, b, i) => {
      if (notes[i].tied && (b.finger !== a.finger || b.anchor !== a.anchor))
        return Infinity;
      const c = pianoMotionCost(notes[i - 1], notes[i], a, b, hand);
      return c.movement + c.repeat + c.crossing;
    },
  );
  if (result.status !== "complete")
    throw Error("No consistent fingering for this voice");
  return result.path.map((pose, i) => ({
    ...pose,
    ...pianoMotion(
      notes[i - 1] ?? notes[i],
      notes[i],
      result.path[i - 1],
      pose,
      hand,
    ),
  }));
}
