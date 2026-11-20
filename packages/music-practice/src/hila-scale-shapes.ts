import { scalePositions, SCALE_FRET_LIMIT } from "./guitar-scales";

export const HILA_SHAPES = [1, 2, 3, 4, 5, 6, 7] as const;
export type HilaShape = (typeof HILA_SHAPES)[number];
// Transcribed from Hila's seven C-major diagrams, ordered up the neck.
// Rows run from low E to high E. Her diagrams supply notes, not fingerings.
const frets = [
  [
    [1, 3, 5],
    [2, 3, 5],
    [2, 3, 5],
    [2, 4, 5],
    [3, 5],
    [1, 3, 5],
  ],
  [
    [3, 5, 7],
    [3, 5, 7],
    [3, 5, 7],
    [4, 5, 7],
    [5, 6],
    [3, 5, 7],
  ],
  [
    [5, 7, 8],
    [5, 7, 8],
    [5, 7, 9],
    [5, 7],
    [5, 6, 8],
    [5, 7, 8],
  ],
  [
    [7, 8, 10],
    [7, 8, 10],
    [7, 9, 10],
    [7, 9, 10],
    [8, 10],
    [7, 8, 10],
  ],
  [
    [8, 10, 12],
    [8, 10, 12],
    [9, 10, 12],
    [9, 10, 12],
    [10, 12],
    [8, 10, 12],
  ],
  [
    [10, 12, 13],
    [10, 12, 14],
    [10, 12, 14],
    [10, 12],
    [10, 12, 13],
    [10, 12, 13],
  ],
  [
    [12, 13, 15],
    [12, 14, 15],
    [12, 14, 15],
    [12, 14],
    [12, 13, 15],
    [12, 13, 15],
  ],
];
export function hilaBounds(shape: HilaShape) {
  const row = frets[shape - 1].flat();
  return [Math.min(...row), Math.max(...row)] as const;
}
export function hilaShift(tonic: number, shape: HilaShape, preferred?: number) {
  const [low, high] = hilaBounds(shape);
  const candidates = [tonic, tonic - 12, tonic + 12].filter(
    (s) => low + s >= 1 && high + s <= SCALE_FRET_LIMIT,
  );
  return candidates.includes(preferred!) ? preferred! : candidates[0];
}
export function hilaPositions(
  tonic: number,
  shape: HilaShape,
  shift: number,
  spelling?: string,
) {
  if (hilaShift(tonic, shape, shift) !== shift)
    throw Error("Invalid Hila shape position");
  const [low, high] = hilaBounds(shape);
  return scalePositions(
    tonic,
    "major",
    spelling,
    low + shift,
    high + shift,
  ).filter((n) => frets[shape - 1][6 - n.string].includes(n.fret - shift));
}
