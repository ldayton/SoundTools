import { STRINGS } from "./guitar";
import { scaleNotes, type ScaleQuality } from "./guitar-scales";

export const SCALE_SHAPES = ["1", "2", "3", "4", "5"] as const;
export type ScaleShape = (typeof SCALE_SHAPES)[number];
export type ScalePattern = ScaleShape | "map";
type Fingering = { frets: number[][]; fingers: number[][] };
// GuitarScale.org's C major and A natural minor shapes. Rows run from string 6
// to string 1; each finger belongs to the fret in the same row and column.
// https://guitarscale.org/c-major.html and /a-minor.html
const major: Record<ScaleShape, Fingering> = {
  "1": {
    frets: [
      [7, 8, 10],
      [7, 8, 10],
      [7, 9, 10],
      [7, 9, 10],
      [8, 10],
      [7, 8, 10],
    ],
    fingers: [
      [1, 2, 4],
      [1, 2, 4],
      [1, 3, 4],
      [1, 3, 4],
      [2, 4],
      [1, 2, 4],
    ],
  },
  "2": {
    frets: [
      [10, 12, 13],
      [10, 12, 14],
      [10, 12, 14],
      [10, 12],
      [10, 12, 13],
      [10, 12, 13],
    ],
    fingers: [
      [1, 3, 4],
      [1, 2, 4],
      [1, 2, 4],
      [1, 3],
      [1, 3, 4],
      [1, 3, 4],
    ],
  },
  "3": {
    frets: [
      [12, 13, 15],
      [12, 14, 15],
      [12, 14],
      [12, 14],
      [12, 13, 15],
      [12, 13, 15],
    ],
    fingers: [
      [1, 2, 4],
      [1, 3, 4],
      [1, 3],
      [1, 3],
      [1, 2, 4],
      [1, 2, 4],
    ],
  },
  "4": {
    frets: [
      [3, 5],
      [2, 3, 5],
      [2, 3, 5],
      [2, 4, 5],
      [3, 5, 6],
      [3, 5],
    ],
    fingers: [
      [2, 4],
      [1, 2, 4],
      [1, 2, 4],
      [1, 3, 4],
      [1, 3, 4],
      [1, 3],
    ],
  },
  "5": {
    frets: [
      [5, 7, 8],
      [5, 7, 8],
      [5, 7],
      [4, 5, 7],
      [5, 6, 8],
      [5, 7, 8],
    ],
    fingers: [
      [1, 3, 4],
      [1, 3, 4],
      [1, 3],
      [1, 2, 4],
      [1, 2, 4],
      [1, 3, 4],
    ],
  },
};
const minor: Record<ScaleShape, Fingering> = {
  "1": major["5"],
  "2": major["1"],
  "3": {
    frets: [
      [10, 12, 13],
      [10, 12],
      [9, 10, 12],
      [9, 10, 12],
      [10, 12, 13],
      [10, 12, 13],
    ],
    fingers: [
      [1, 3, 4],
      [1, 3],
      [1, 2, 4],
      [1, 2, 4],
      [1, 3, 4],
      [1, 3, 4],
    ],
  },
  "4": {
    frets: [
      [12, 13, 15],
      [12, 14, 15],
      [12, 14, 15],
      [12, 14],
      [12, 13, 15],
      [12, 13, 15],
    ],
    fingers: [
      [1, 2, 4],
      [1, 3, 4],
      [1, 3, 4],
      [1, 3],
      [1, 2, 4],
      [1, 2, 4],
    ],
  },
  "5": major["4"],
};
const templates = { major, minor };
export function patternBounds(
  shape: ScaleShape,
  quality: ScaleQuality = "major",
) {
  const frets = templates[quality][shape].frets.flat();
  return [Math.min(...frets), Math.max(...frets)] as const;
}
export function patternShift(
  tonic: number,
  quality: ScaleQuality,
  shape: ScaleShape,
  preferred?: number,
) {
  const [low, high] = patternBounds(shape, quality);
  const delta = tonic - (quality === "major" ? 0 : 9);
  const valid = (shift: number) => low + shift >= 1 && high + shift <= 22;
  if (
    preferred !== undefined &&
    Number.isInteger(preferred) &&
    (preferred - delta) % 12 === 0 &&
    valid(preferred)
  )
    return preferred;
  return [delta - 12, delta, delta + 12].find(
    (shift) => valid(shift) && low + shift <= 12,
  )!;
}
export function relativePattern(
  shape: ScaleShape,
  quality: ScaleQuality,
): ScaleShape {
  return String(
    quality === "major"
      ? (Number(shape) % 5) + 1
      : ((Number(shape) + 3) % 5) + 1,
  ) as ScaleShape;
}
/** Old CAGED bookmarks remain usable; new routes only publish numbered shapes. */
export function migratePattern(value: unknown, quality: ScaleQuality): unknown {
  const old = { E: "1", D: "2", C: "3", A: "4", G: "5" } as const;
  const mapped = old[value as keyof typeof old];
  return mapped
    ? quality === "major"
      ? mapped
      : relativePattern(mapped, "major")
    : value;
}
export function patternPositions(
  tonic: number,
  quality: ScaleQuality,
  shape: ScaleShape,
  shift: number,
  spelling?: string,
) {
  const notes = scaleNotes(tonic, quality, spelling);
  const template = templates[quality][shape];
  return template.frets.flatMap((frets, index) => {
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
        finger: template.fingers[index][i],
        octave: (midi - note.natural - note.accidental) / 12 - 1,
        root: note.degree === 1,
        openAlternative: undefined,
      };
    });
  });
}
