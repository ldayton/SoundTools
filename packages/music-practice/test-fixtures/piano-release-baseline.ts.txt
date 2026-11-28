/** Phrase-level, constraint-based prototype; suggested fingerings, not an anatomical model.
 * References: Parncutt et al. (1997), MIT 6.006 piano-fingering DP lecture,
 * and https://github.com/marcomusy/pianoplayer (look-ahead/hand movement).
 * This implementation is original TypeScript, with no imported model/code.
 */
export type FingerNote = {
  midi: number;
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
const whitePosition = [0, 0.6, 1, 1.6, 2, 3, 3.6, 4, 4.6, 5, 5.6, 6];
export const pianoKeyPosition = (midi: number) =>
  Math.floor(midi / 12) * 7 + whitePosition[((midi % 12) + 12) % 12];
const black = (midi: number) =>
  [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
type State = { finger: number; anchor: number; cost: number; previous?: State };
/** One voice of single notes. Fingers run 1 (thumb) to 5, mirrored for LH. */
export function planPianoFingering(
  notes: readonly FingerNote[],
  hand: "right" | "left",
): PianoFinger[] {
  if (!notes.length) return [];
  const sign = hand === "right" ? 1 : -1;
  let states: State[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i],
      x = pianoKeyPosition(note.midi);
    const next: State[] = [];
    for (let finger = 1; finger <= 5; finger++) {
      const ideal = x - sign * (finger - 1);
      for (
        let anchor = Math.floor(ideal);
        anchor <= Math.ceil(ideal);
        anchor++
      ) {
        const stretch = Math.abs(x - (anchor + sign * (finger - 1)));
        if (stretch > 0.61) continue;
        const local =
          stretch * stretch * 3 +
          (black(note.midi)
            ? finger === 1
              ? 1.8
              : finger === 5
                ? 0.4
                : 0
            : 0) +
          (finger === 4 ? 0.15 : 0);
        if (!i) {
          next.push({ finger, anchor, cost: local });
          continue;
        }
        let best: State | undefined,
          cost = Infinity;
        for (const previous of states) {
          const p = notes[i - 1],
            distance = Math.abs(anchor - previous.anchor);
          if (note.tied && (finger !== previous.finger || distance !== 0))
            continue;
          const delta = note.midi - p.midi;
          const crossed = delta * (finger - previous.finger) * sign < 0;
          if (crossed && !distance) continue;
          // A non-thumb crossing needs a complete relocation; don't suggest
          // passing ordinary fingers over one another in a connected position.
          const awkward = crossed && finger !== 1 && previous.finger !== 1;
          const opportunity = note.restBefore
            ? 0.3
            : p.duration >= 0.5
              ? 0.65
              : 1;
          let move = distance ? (5 + distance * 1.8) * opportunity : 0;
          if (awkward) move += 8 * opportunity;
          if (delta && finger === previous.finger) move += 4 * opportunity;
          if (!delta && finger !== previous.finger) move += 4;
          if (crossed && (finger === 1 || previous.finger === 1)) {
            const over = finger === 1 ? previous.finger : finger;
            move += over === 3 ? 0 : over === 4 ? 0.3 : 1;
          }
          const total = previous.cost + local + move;
          if (total < cost) {
            cost = total;
            best = previous;
          }
        }
        if (best) next.push({ finger, anchor, cost, previous: best });
      }
    }
    if (!next.length) throw Error("No consistent fingering for this voice");
    states = next;
  }
  let state = states.reduce((a, b) => (a.cost <= b.cost ? a : b));
  const result: PianoFinger[] = Array(notes.length);
  for (let i = notes.length - 1; i >= 0; i--) {
    const previous = state.previous;
    const shift =
      !!previous &&
      (previous.anchor !== state.anchor ||
        (notes[i].midi !== notes[i - 1].midi &&
          previous.finger === state.finger));
    result[i] = {
      finger: state.finger,
      anchor: state.anchor,
      shift,
      crossing:
        !!previous &&
        shift &&
        Math.abs(state.anchor - previous.anchor) <= 4 &&
        Math.abs(
          pianoKeyPosition(notes[i].midi) - pianoKeyPosition(notes[i - 1].midi),
        ) <= 1.6 &&
        (notes[i].midi - notes[i - 1].midi) *
          (state.finger - previous.finger) *
          sign <
          0 &&
        (state.finger === 1 || previous.finger === 1),
    };
    state = previous!;
  }
  return result;
}
