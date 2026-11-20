/** Finger suggestions for an already chosen string/fret sequence. No tab rewriting. */
export type GuitarFingerNote = {
  string: number;
  fret: number;
  duration: number;
  restBefore?: boolean;
};
export type GuitarFinger = { finger: number; position: number; shift: boolean };
type State = GuitarFinger & { cost: number; previous: number };
export function planGuitarFingering(
  notes: readonly GuitarFingerNote[],
): GuitarFinger[] {
  if (!notes.length) return [];
  if (
    notes.some(
      (n) =>
        !Number.isInteger(n.fret) ||
        n.fret < 0 ||
        n.fret > 24 ||
        !Number.isInteger(n.string) ||
        n.string < 1 ||
        n.string > 6 ||
        !Number.isFinite(n.duration) ||
        n.duration <= 0,
    )
  )
    throw Error("Invalid guitar fingering input");
  const layers: State[][] = [];
  for (const [index, note] of notes.entries()) {
    const candidates: State[] = [];
    for (let position = 1; position <= 24; position++)
      for (
        let finger = note.fret ? 1 : 0;
        finger <= (note.fret ? 4 : 0);
        finger++
      ) {
        const stretch = note.fret
          ? Math.abs(note.fret - (position + finger - 1))
          : 0;
        if (stretch > 1) continue;
        // Favor ordinary one-fret-per-finger placement and low positions.
        const local = stretch * 3 + position * 0.04;
        let cost = index ? Infinity : local,
          previous = -1;
        for (const [j, prev] of (layers[index - 1] || []).entries()) {
          const before = notes[index - 1];
          const distance = Math.abs(position - prev.position);
          const shift = distance
            ? (3 + distance * 3) / Math.max(0.25, before.duration * 4)
            : 0;
          const repeated =
            note.fret &&
            before.fret === note.fret &&
            before.string === note.string &&
            finger !== prev.finger
              ? 4
              : 0;
          const reuse =
            finger &&
            finger === prev.finger &&
            note.string !== before.string &&
            note.fret !== before.fret
              ? 2
              : 0;
          const next =
            prev.cost +
            local +
            (note.restBefore ? shift * 0.2 : shift + repeated + reuse);
          if (next < cost) {
            cost = next;
            previous = j;
          }
        }
        candidates.push({ finger, position, shift: false, cost, previous });
      }
    layers.push(candidates);
  }
  let best = layers
    .at(-1)!
    .reduce((a, b, i, all) => (b.cost < all[a].cost ? i : a), 0);
  const result: GuitarFinger[] = new Array(notes.length);
  for (let i = notes.length - 1; i >= 0; i--) {
    const state = layers[i][best];
    result[i] = {
      finger: state.finger,
      position: state.position,
      shift: false,
    };
    best = state.previous;
  }
  for (let i = 1; i < result.length; i++)
    result[i].shift = result[i].position !== result[i - 1].position;
  return result;
}
