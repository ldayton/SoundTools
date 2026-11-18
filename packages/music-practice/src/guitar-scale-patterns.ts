import { STRINGS } from "./guitar";
import { isMajorScale, scaleNotes, type ScaleQuality } from "./guitar-scales";

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
// Remove the two omitted degrees from the existing five positions. Use a
// consistent four-fret hand position for each two-notes-per-string box.
function pentatonic(source: Record<ScaleShape, Fingering>) {
  const pitches = new Set([0, 2, 4, 7, 9]); // C major / A minor pentatonic
  return Object.fromEntries(SCALE_SHAPES.map(shape => {
    const frets = source[shape].frets.map((row, index) => row.filter(fret =>
      pitches.has((STRINGS.find(s => s.number === 6 - index)!.midi + fret) % 12)));
    const low = Math.min(...frets.flat());
    return [shape, { frets, fingers: frets.map(row => row.map(fret => fret - low + 1)) }];
  })) as Record<ScaleShape, Fingering>;
}
const minorPentatonic = pentatonic(minor);
// This box changes hand position at the G string and again at B.
minorPentatonic["3"].fingers = [[1,3],[1,3],[1,3],[1,4],[1,4],[1,3]];
const majorPentatonic = pentatonic(major);
majorPentatonic["2"] = minorPentatonic["3"];
// Add the shared E-flat blue note to each C-major/A-minor pentatonic box.
// Retain existing fingers, including the position changes in the third minor box.
function blues(source: Record<ScaleShape, Fingering>) {
  return Object.fromEntries(SCALE_SHAPES.map(shape => {
    const box = source[shape];
    const low = Math.min(...box.frets.flat()), high = Math.max(...box.frets.flat());
    const frets = box.frets.map((row,index) => [...new Set([...row,
      ...Array.from({length: high-low+1},(_,i)=>low+i).filter(fret =>
        (STRINGS.find(s=>s.number===6-index)!.midi+fret)%12===3)
    ])].sort((a,b)=>a-b));
    // Include every blue-note octave inside the run, even when it sits just
    // outside the pentatonic box (for example B-string fret 16 in box 4).
    const midi = box.frets.flatMap((row,index)=>row.map(fret=>STRINGS.find(s=>s.number===6-index)!.midi+fret));
    for (let pitch=Math.min(...midi); pitch<=Math.max(...midi); pitch++) {
      if (pitch%12!==3 || frets.some((row,index)=>row.some(fret=>STRINGS.find(s=>s.number===6-index)!.midi+fret===pitch))) continue;
      const candidates = box.frets.map((row,index)=>{
        const fret=pitch-STRINGS.find(s=>s.number===6-index)!.midi;
        const distance=Math.max(row[0]-fret, fret-row.at(-1)!, 0);
        return {index,fret,distance};
      }).filter(c=>c.fret>=low-1 && c.fret<=high+1).sort((a,b)=>a.distance-b.distance);
      const candidate=candidates[0];
      if (!candidate) throw Error("Missing blue-note position");
      frets[candidate.index].push(candidate.fret);
      frets[candidate.index].sort((a,b)=>a-b);
    }
    const fingers = frets.map((row,index)=>row.map(fret=>{
      if (row[0] < box.frets[index][0] || row.at(-1)! > box.frets[index].at(-1)!)
        return Math.max(1, Math.min(4, fret-row[0]+1));
      const original = box.frets[index].indexOf(fret);
      return original >= 0 ? box.fingers[index][original] :
        Math.max(1, Math.min(4, box.fingers[index][0]+fret-box.frets[index][0]));
    }));
    return [shape,{frets,fingers}];
  })) as Record<ScaleShape,Fingering>;
}
const templates = { major, minor, "major-pentatonic": majorPentatonic, "minor-pentatonic": minorPentatonic, "major-blues": blues(majorPentatonic), "minor-blues": blues(minorPentatonic) };
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
  const delta = tonic - (isMajorScale(quality) ? 0 : 9);
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
    isMajorScale(quality)
      ? (Number(shape) % 5) + 1
      : ((Number(shape) + 3) % 5) + 1,
  ) as ScaleShape;
}
/** Old CAGED bookmarks remain usable; new routes only publish numbered shapes. */
export function migratePattern(value: unknown, quality: ScaleQuality): unknown {
  const old = { E: "1", D: "2", C: "3", A: "4", G: "5" } as const;
  const mapped = old[value as keyof typeof old];
  return mapped
    ? isMajorScale(quality)
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

/** Choose the octave placement with the most shared string/fret positions. */
export function linkedPatternPositions(
  tonic: number, quality: ScaleQuality, shape: ScaleShape, shift: number,
  linked: ScaleShape, spelling?: string,
) {
  const primary = patternPositions(tonic, quality, shape, shift, spelling);
  const keys = new Set(primary.map(n => `${n.string}:${n.fret}`));
  const [low, high] = patternBounds(linked, quality);
  const delta = tonic - (isMajorScale(quality) ? 0 : 9);
  const candidates = [delta - 24, delta - 12, delta, delta + 12, delta + 24]
    .filter(s => low + s >= 1 && high + s <= 22)
    .map(s => {
      const notes = patternPositions(tonic, quality, linked, s, spelling);
      const overlap = notes.filter(n => keys.has(`${n.string}:${n.fret}`)).length;
      const distance = Math.abs(Math.min(...notes.map(n => n.fret)) - Math.min(...primary.map(n => n.fret)));
      return { notes, overlap, distance };
    })
    .sort((a, b) => b.overlap - a.overlap || a.distance - b.distance);
  return candidates[0].notes;
}
