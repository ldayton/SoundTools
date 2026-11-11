import { STRINGS } from "./guitar";
import { scaleNotes, type ScaleQuality } from "./guitar-scales";

// G-major positions, E–D–C–A–G, cross-checked against Pebber Brown's
// five-position CAGED chart. These are explicit fingerings, not fret windows.
// https://pbguitarstudio.com/pdf_files/GUITAR_PDF/G_Major_5_Pos_CAGED_one_page.pdf
export const CAGED_SHAPES = ["E", "D", "C", "A", "G"] as const;
export type CagedShape = (typeof CAGED_SHAPES)[number];
export type ScalePattern = CagedShape | "map";
const templates: Record<CagedShape, number[][]> = {
  E: [
    [2, 3, 5],
    [2, 3, 5],
    [2, 4, 5],
    [2, 4, 5],
    [3, 5],
    [2, 3, 5],
  ],
  D: [
    [3, 5, 7],
    [3, 5, 7],
    [4, 5, 7],
    [4, 5, 7],
    [5, 7, 8],
    [5, 7, 8],
  ],
  C: [
    [7, 8, 10],
    [7, 9, 10],
    [7, 9, 10],
    [7, 9],
    [8, 10],
    [7, 8, 10],
  ],
  A: [
    [10, 12],
    [9, 10, 12],
    [9, 10, 12],
    [9, 11, 12],
    [10, 12, 13],
    [10, 12],
  ],
  G: [
    [12, 14, 15],
    [12, 14, 15],
    [12, 14],
    [12, 14, 16],
    [12, 13, 15],
    [12, 14, 15],
  ],
};
const fingers: Record<CagedShape, number[][]> = {
  E: [
    [1, 2, 4],
    [1, 2, 4],
    [1, 3, 4],
    [1, 3, 4],
    [2, 4],
    [1, 2, 4],
  ],
  D: [
    [1, 2, 4],
    [1, 2, 4],
    [1, 2, 4],
    [1, 2, 4],
    [1, 3, 4],
    [1, 3, 4],
  ],
  C: [
    [1, 2, 4],
    [1, 3, 4],
    [1, 3, 4],
    [1, 3],
    [2, 4],
    [1, 2, 4],
  ],
  A: [
    [2, 4],
    [1, 2, 4],
    [1, 2, 4],
    [1, 3, 4],
    [1, 3, 4],
    [1, 3],
  ],
  G: [
    [1, 3, 4],
    [1, 3, 4],
    [1, 3],
    [1, 2, 4],
    [1, 2, 4],
    [1, 3, 4],
  ],
};
export function patternBounds(shape: CagedShape) {
  return [
    Math.min(...templates[shape].flat()),
    Math.max(...templates[shape].flat()),
  ] as const;
}
export function patternShift(
  tonic: number,
  quality: ScaleQuality,
  shape: CagedShape,
  preferred?: number,
) {
  const [low, high] = patternBounds(shape);
  // Minor uses the same shape as its relative major; the root markers change.
  const majorTonic = (tonic + (quality === "minor" ? 3 : 0)) % 12;
  const delta = (majorTonic - 7 + 12) % 12;
  const valid = (shift: number) => low + shift >= 1 && high + shift <= 22;
  if (
    preferred !== undefined &&
    Number.isInteger(preferred) &&
    (preferred - delta) % 12 === 0 &&
    valid(preferred)
  )
    return preferred;
  return [delta - 24, delta - 12, delta, delta + 12].find(valid)!;
}
export function patternPositions(
  tonic: number,
  quality: ScaleQuality,
  shape: CagedShape,
  shift: number,
  spelling?: string,
) {
  const notes = scaleNotes(tonic, quality, spelling);
  return templates[shape].flatMap((frets, index) => {
    const string = STRINGS.find((s) => s.number === 6 - index)!;
    return frets.map((fret, i) => {
      fret += shift;
      const midi = string.midi + fret;
      const note = notes.find((n) => n.pitchClass === midi % 12);
      if (!note || fret < 1 || fret > 22)
        throw Error("Invalid movable scale position");
      return {
        ...note,
        string: string.number,
        fret,
        midi,
        finger: fingers[shape][index][i],
        octave: (midi - note.natural - note.accidental) / 12 - 1,
        root: note.degree === 1,
        openAlternative: undefined,
      };
    });
  });
}
