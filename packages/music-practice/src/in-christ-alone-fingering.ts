import type { BeginnerInstrument } from "./beginner-score";
/** Printed fingering/tablature positions are relative to capo 2. */
export function christGuitarPosition(
  pitch: number,
  chord: boolean,
  transpose = 0,
) {
  const p = pitch - transpose;
  const position: Record<number, [number, number]> = {
    72: [0, 8],
    71: [0, 7],
    69: [0, 5],
    62: [1, 3],
    43: [5, 3],
    47: [4, 2],
    50: [3, 0],
    55: [2, 0],
    59: [1, 0],
    67: [0, 3],
    48: [4, 3],
    52: [3, 2],
    60: [1, 1],
    64: [0, 0],
    53: [3, 3],
    57: [2, 2],
    65: [0, 1],
    45: [4, 0],
  };
  const entry = position[p];
  return entry ? { str: entry[0], num: entry[1] + transpose } : undefined;
}
export function christFingers(
  instrument: BeginnerInstrument,
  bar: number,
  voice: number,
  pitches: number[],
  force = false,
): (number | null)[] {
  if (instrument === "guitar") {
    return pitches.map((sounding) => {
      const pitch = sounding - 2;
      if (voice === 1)
        return (
          { 43: 2, 48: 3, 52: 2, 53: bar === 9 || bar === 11 ? 1 : 3 }[pitch] ??
          null
        );
      return (
        {
          57: 2,
          60: 1,
          62: [2, 6, 14].includes(bar) ? 4 : 3,
          67: 4,
          69: 3,
          71: 1,
          72: 2,
        }[pitch] ?? null
      );
    });
  }
  if (voice === 1) return pitches.map((_, i) => [5, 3, 1][i] ?? null);
  const fingers: Record<number, number> =
    bar < 8 || (bar >= 12 && bar < 17)
      ? { 57: 1, 59: 2, 62: 3, 64: 4, 66: 5 }
      : bar === 8
        ? { 62: 1, 66: 2, 69: 4 }
        : bar === 9
          ? { 71: 5, 69: 4, 66: 2 }
          : bar === 10
            ? { 64: 2, 62: 1, 74: 5, 73: 4 }
            : bar === 11
              ? { 71: 3, 69: 2, 66: 1 }
              : { 62: 1, 66: 3 };
  // Repeated figures need no second set of annotations.
  const show = force || [0, 2, 8, 9, 10, 11, 12, 17, 19].includes(bar);
  return pitches.map((p) => (show ? (fingers[p] ?? null) : null));
}
