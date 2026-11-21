import type { BeginnerInstrument } from "./beginner-score";
/** Editorial choices for this edition, in sounding pitch and low-to-high chord order. */
export function bluesFingers(
  instrument: BeginnerInstrument,
  bar: number,
  voice: number,
  pitches: number[],
): (number | null)[] {
  return pitches.map((pitch) => {
    if (instrument === "guitar") {
      if (bar === 12)
        return (
          ({ 47: 2, 52: 3, 56: 1, 62: 4 } as Record<number, number>)[pitch] ??
          null
        );
      if (voice === 1) return pitch === 47 ? 1 : pitch === 46 ? 1 : null;
      if (bar === 8) return pitch === 66 ? 2 : null;
      if (bar === 9) return pitch === 61 ? 1 : pitch === 67 ? 2 : null;
      if (pitches.length > 1)
        return (
          ({ 52: 2, 56: 1, 61: 3 } as Record<number, number>)[pitch] ?? null
        );
      return ({ 64: 3, 67: 1, 69: 4 } as Record<number, number>)[pitch] ?? null;
    }
    if (voice === 1) {
      if (bar === 12)
        return ({ 40: 5, 47: 1 } as Record<number, number>)[pitch] ?? null;
      if (pitches.length > 1)
        return (
          ({ 52: 5, 56: 3, 61: 1 } as Record<number, number>)[pitch] ?? null
        );
      return (
        ({ 40: 5, 45: 2, 46: 1, 47: 1 } as Record<number, number>)[pitch] ??
        null
      );
    }
    if (bar === 12)
      return ({ 56: 1, 62: 4, 64: 5 } as Record<number, number>)[pitch] ?? null;
    if (bar === 8) return pitch === 59 ? 1 : pitch === 66 ? 5 : null;
    if (bar === 9) return pitch === 61 ? 2 : pitch === 67 ? 5 : null;
    return ({ 64: 1, 67: 3, 69: 4 } as Record<number, number>)[pitch] ?? null;
  });
}

/** Reviewed piano redistribution of the source guitar turnaround and final E7. */
export function bluesPianoAbc(abc: string) {
  return abc
    .replace("%%staves S1 | S2", "%%score {S1 | S2}")
    .replace("zE G2 z2 [E,^G,^C]2", "zE G2 z4")
    .replace("_B,,2 z2", "_B,,2 [E,^G,^C]2")
    .replace("[E,^G,DE]8", "[^G,DE]8");
}

/** Standard part labels and printed bar numbers do not change the musical timeline. */
export function bluesLandmarks(abc: string, from = 0): string {
  let row = 0;
  const names = ["A", "B", "C"];
  return (
    "%%barnumbers 1\n%%barnumberfont serif 10\n%%partsfont serif 12\n%%partsbox 1\n" +
    abc
      .split("\n")
      .map((line) => {
        if (!/^\[V:(?:S1|v0)\]/.test(line)) return line;
        const bar = from + row++ * 4;
        const part = bar % 4 === 0 && bar < 12 ? names[bar / 4] : undefined;
        if (part) line = line.replace(/^(\[V:[^\]]+\])\s*/, `$1 [P:${part}] `);
        return line.replace(/:\|\s*/, ":| [P:Ending] ");
      })
      .join("\n")
  );
}

// String indices run from high E (0) to low E (5), matching abcjs.
const sourcePositions: Record<number, [number, number]> = {
  40: [5, 0],
  45: [4, 0],
  46: [4, 1],
  47: [4, 2],
  52: [3, 2],
  56: [2, 1],
  59: [1, 0],
  61: [1, 2],
  62: [1, 3],
  64: [1, 5],
  66: [0, 2],
  67: [0, 3],
  69: [0, 5],
};
export function bluesPosition(pitch: number, chord: boolean, transpose = 0) {
  const original = pitch - transpose;
  const position =
    original === 64 && chord ? [0, 0] : sourcePositions[original];
  if (!position) return undefined;
  const [str, fret] = position;
  const num = fret + transpose;
  return num >= 0 && num <= 24 ? { str, num } : undefined;
}
