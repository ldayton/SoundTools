import type { InstrumentHymn } from "./instrument-hymn";
import type { BeginnerInstrument } from "./beginner-score";
// Chord changes are measured in sixty-fourth notes from each bar's start.
export const faithfulEdition: InstrumentHymn = {
  title: "O Come, All Ye Faithful",
  key: "G",
  guitarKey: "G",
  guitarTranspose: 0,
  tempo: 72,
  meter: "4/4",
  changes: [
    [[0, "G"]],
    [[0, "G"]],
    [[0, "D"]],
    [
      [0, "G"],
      [16, "D"],
      [32, "G"],
      [48, "C"],
    ],
    [
      [0, "G"],
      [32, "D"],
      [48, "Em"],
    ],
    [
      [0, "Em"],
      [32, "D"],
      [48, "A7"],
    ],
    [
      [0, "D"],
      [16, "G"],
      [32, "D"],
      [48, "Em"],
    ],
    [
      [0, "D"],
      [32, "A7"],
      [56, "D"],
    ],
    [[0, "D"]],
    [
      [0, "Bm"],
      [32, "Am"],
      [48, "G"],
    ],
    [
      [0, "Am"],
      [32, "G"],
    ],
    [
      [0, "D"],
      [16, "G"],
      [32, "Em"],
      [48, "Am"],
    ],
    [
      [0, "D"],
      [48, "G"],
    ],
    [
      [0, "G"],
      [16, "D"],
      [32, "G"],
      [48, "D7"],
    ],
    [[0, "G"]],
    [
      [0, "G"],
      [16, "D"],
      [32, "G"],
      [48, "D7"],
    ],
    [
      [0, "G"],
      [32, "D"],
      [48, "G"],
    ],
    [
      [0, "D7"],
      [16, "G"],
      [32, "D"],
      [48, "A7"],
    ],
    [
      [0, "D"],
      [16, "D7"],
      [32, "G"],
      [48, "C"],
    ],
    [
      [0, "G"],
      [32, "D"],
      [56, "G"],
    ],
    [[0, "G"]],
  ],
  piano: {
    G: "[G,,B,,D,]",
    C: "[C,E,G,]",
    Em: "[E,,G,,B,,]",
    D: "[D,F,A,]",
    D7: "[F,,A,,C,]",
    Am: "[A,,C,E,]",
    A7: "[^C,E,G,]",
    Bm: "[B,,D,F,]",
  },
  guitar: {
    G: "[G,B,]",
    C: "C",
    Em: "[E,B,]",
    D: "F,",
    D7: "[F,C]",
    Am: "A,",
    A7: "[G,^C]",
    Bm: "B,",
  },
  strum: {
    G: "[G,B,DGBg]",
    C: "[CEGce]",
    D: "[DAdf]",
    D7: "[DAcf]",
    Em: "[E,B,EGBe]",
    Am: "[A,EAce]",
    A7: "[A,EG^ce]",
    Bm: "[FBdf]",
  },
  barLengths: [16, ...Array(19).fill(64), 48],
  groups: [
    [0, 1],
    [2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11],
    [12, 13, 14, 15],
    [16, 17, 18],
    [19, 20],
  ],
  marks: [
    { bar: 0, label: "Verse" },
    { bar: 12, at: 48, label: "Refrain" },
  ],
};
export function faithfulPosition(
  pitch: number,
  _chord: boolean,
  transpose = 0,
) {
  const positions: Record<number, [number, number]> = {
    40: [5, 0],
    42: [5, 2],
    43: [5, 3],
    45: [4, 0],
    47: [4, 2],
    48: [4, 3],
    49: [4, 4],
    50: [3, 0],
    52: [3, 2],
    54: [3, 4],
    55: [2, 0],
    57: [2, 2],
    59: [1, 0],
    60: [1, 1],
    62: [1, 3],
    64: [0, 0],
    66: [0, 2],
    67: [0, 3],
  };
  const p = positions[pitch - transpose];
  return p ? { str: p[0], num: p[1] + transpose } : undefined;
}
export function faithfulFingers(
  instrument: BeginnerInstrument,
  bar: number,
  voice: number,
  pitches: number[],
  force = false,
): (number | null)[] {
  if (instrument === "guitar")
    return pitches.map(
      (p) =>
        (voice === 1
          ? ({ 42: 2, 43: 3, 47: 2, 48: 3, 49: 4 } as Record<number, number>)
          : ({ 52: 1, 54: 4, 57: 1, 60: 1, 62: 4 } as Record<number, number>))[
          p
        ] ?? null,
    );
  if (voice === 1) return pitches.map((_, i) => [5, 3, 1][i] ?? null);
  // Reposition between phrases rather than stretch a fixed hand position.
  const positions: Record<number, Record<number, number>> = {
    0: { 67: 1 },
    1: { 67: 4, 62: 1 },
    2: { 69: 5, 62: 1 },
    3: { 71: 3, 69: 2, 72: 4 },
    4: { 71: 3, 67: 1 },
    5: { 67: 4, 64: 2 },
    6: { 66: 2, 71: 5 },
    7: { 66: 3, 62: 1 },
    8: { 62: 1 },
    9: { 74: 5, 71: 3 },
    10: { 72: 4 },
    11: { 69: 2, 67: 1 },
    12: { 66: 3, 62: 1, 67: 4 },
    13: { 67: 2, 66: 1 },
    14: { 67: 4, 62: 1, 71: 5 },
    15: { 71: 3, 72: 4 },
    16: { 71: 3 },
    17: { 72: 4, 67: 1 },
    18: { 66: 2, 72: 5 },
    19: { 71: 3, 67: 1 },
    20: { 67: 1 },
  };
  const fallback: Record<number, number> = {
    62: 1,
    64: 2,
    66: 3,
    67: 1,
    69: 2,
    71: 3,
    72: 4,
    74: 5,
  };
  return pitches.map(
    (p) => positions[bar]?.[p] ?? (force ? (fallback[p] ?? null) : null),
  );
}
