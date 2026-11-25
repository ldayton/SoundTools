import { planGuitarPhrase } from "./guitar-phrase-fingering";
/** Finger suggestions for an already chosen string/fret sequence. No tab rewriting. */
export type GuitarFingerNote = {
  string: number;
  fret: number;
  duration: number;
  restBefore?: boolean;
};
export type GuitarFinger = { finger: number; position: number; shift: boolean };
/** Compatibility adapter; the phrase planner owns all fingering decisions. */
export function planGuitarFingering(
  notes: readonly GuitarFingerNote[],
): GuitarFinger[] {
  let start = 0;
  const events = notes.map((note, index) => {
    if (note.restBefore) start += 1;
    const event = {
      id: String(index),
      start,
      duration: note.duration * 4,
      string: note.string,
      fret: note.fret,
    };
    start += event.duration;
    return event;
  });
  const plan = planGuitarPhrase(events);
  if (!plan) return [];
  return plan.notes.map((note, index) => ({
    finger: note.finger,
    position: note.position,
    shift: index > 0 && note.position !== plan.notes[index - 1].position,
  }));
}
