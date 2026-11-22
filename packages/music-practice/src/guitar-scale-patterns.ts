import {isMaqam} from "./maqamat";
import { STRINGS } from "./guitar";
import { isMajorScale, scaleNotes, scalePositions, type ScaleQuality } from "./guitar-scales";

export const SCALE_SHAPES = ["1", "2", "3", "4", "5"] as const;
export type ScaleShape = (typeof SCALE_SHAPES)[number];
export type ScalePattern = ScaleShape | "map";
// IDs remain stable for saved practice state and existing numbered URLs.
export const CAGED_SHAPES = ["3", "4", "5", "1", "2"] as const;
export function scaleShapeLabel(shape: ScalePattern | "none", quality: ScaleQuality): string {
  if (shape === "map") return "Fret range";
  if (shape === "none") return "Single shape";
  const chord = { "1": "E", "2": "D", "3": "C", "4": "A", "5": "G" }[shape];
  return `${chord}${isMajorScale(quality) ? "" : "m"} shape`;
}
/** The chord voicing anchoring each position, low E through high E. */
export function cagedChordPositions(shape: ScaleShape, quality: ScaleQuality, shift: number) {
  const majorChords: Record<ScaleShape, (number | null)[]> = {
    "1": [8,10,10,9,8,8], "2": [null,null,10,12,13,12],
    "3": [null,15,14,12,13,12], "4": [null,3,5,5,5,3], "5": [8,7,5,5,5,8],
  };
  const minorChords: Record<ScaleShape, (number | null)[]> = {
    "1": [5,7,7,5,5,5], "2": [null,null,7,9,10,8],
    // The high-E chord tone lies outside this scale position; show the four-note voicing.
    "3": [null,12,10,9,10,null], "4": [null,12,14,14,13,12], "5": [5,3,2,2,5,5],
  };
  return (isMajorScale(quality) ? majorChords : minorChords)[shape].flatMap((fret,row)=>
    fret === null ? [] : [{string:6-row,fret:fret+shift}]);
}
/** Familiar reference position of the chord that names a CAGED framework. */
export function cagedReferenceChord(shape: ScaleShape, quality: ScaleQuality) {
  const shifts = isMajorScale(quality)
    ? {"1":-8,"2":-10,"3":-12,"4":-3,"5":-5}
    : {"1":-5,"2":-7,"3":-9,"4":-12,"5":-2};
  const positions=cagedChordPositions(shape,quality,shifts[shape]);
  return {
    name:scaleShapeLabel(shape,quality).replace(" shape",""),
    frets:Array.from({length:6},(_,i)=>positions.find(n=>n.string===6-i)?.fret ?? null),
  };
}
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
// Keep each pentatonic inside its own numbered full-scale position. Retain
// the parent fingering so removing notes never introduces a new hand shift.
// These are scale subsets, not necessarily two-notes-per-string boxes.
function pentatonic(source: Record<ScaleShape, Fingering>) {
  const pitches = new Set([0, 2, 4, 7, 9]); // C major / A minor pentatonic
  return Object.fromEntries(SCALE_SHAPES.map(shape => {
    const rows = source[shape].frets.map((row, index) => row.flatMap((fret, column) =>
      pitches.has((STRINGS.find(s => s.number === 6 - index)!.midi + fret) % 12)
        ? [{ fret, finger: source[shape].fingers[index][column] }]
        : []));
    return [shape, {
      frets: rows.map(row => row.map(note => note.fret)),
      fingers: rows.map(row => row.map(note => note.finger)),
    }];
  })) as Record<ScaleShape, Fingering>;
}
const minorPentatonic = pentatonic(minor);
const majorPentatonic = pentatonic(major);
// Blue-note placements from GuitarScale.org's A blues diagrams (low E to
// high E). Keep edge blue notes as well as those inside the pentatonic bounds.
const minorBlueFrets: Record<ScaleShape, number[][]> = {
  "1": [[], [6], [], [8], [], []],
  "2": [[11], [], [], [8], [], [11]],
  "3": [[11], [], [13], [], [], [11]],
  "4": [[], [], [13], [], [16], []],
  "5": [[], [6], [], [], [4], []],
};
function blues(source: Record<ScaleShape, Fingering>, blueFrets: Record<ScaleShape, number[][]>) {
  return Object.fromEntries(SCALE_SHAPES.map(shape => {
    const rows = source[shape].frets.map((frets, row) => {
      const notes = frets.map((fret, column) => ({ fret, finger: source[shape].fingers[row][column] }));
      for (const fret of blueFrets[shape][row]) {
        const before = [...notes].reverse().find(note => note.fret < fret);
        const after = notes.find(note => note.fret > fret);
        // Use a spare finger between neighbours, or slide the adjacent finger
        // one fret when the parent fingering leaves none free.
        const finger = before && after && after.finger - before.finger > 1
          ? before.finger + 1
          : before && fret - before.fret === 1 ? before.finger
          : after && after.fret - fret === 1 ? after.finger
          : (() => { throw Error('Blue note needs an explicit playable fingering'); })();
        notes.push({ fret, finger });
        notes.sort((a, b) => a.fret - b.fret);
      }
      return notes;
    });
    return [shape, { frets: rows.map(row => row.map(n => n.fret)), fingers: rows.map(row => row.map(n => n.finger)) }];
  })) as Record<ScaleShape, Fingering>;
}
const minorBlues = blues(minorPentatonic, minorBlueFrets);
const majorBlueFrets = Object.fromEntries(SCALE_SHAPES.map(shape =>
  [shape, minorBlueFrets[relativePattern(shape, "major")]])) as Record<ScaleShape, number[][]>;
const majorBlues = blues(majorPentatonic, majorBlueFrets);
const templates = { major, minor, "major-pentatonic": majorPentatonic, "minor-pentatonic": minorPentatonic, "major-blues": majorBlues, "minor-blues": minorBlues };
function templatesFor(quality:ScaleQuality){
  if(isMaqam(quality))throw Error('Maqamat use their own hand positions');
  return templates[quality];
}
export function patternBounds(
  shape: ScaleShape,
  quality: ScaleQuality = "major",
) {
  const frets = templatesFor(quality)[shape].frets.flat();
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
  const template = templatesFor(quality)[shape];
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
  linked: ScaleShape, spelling?: string, preferredShift?: number,
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
      return { notes, overlap, distance, shift: s };
    })
    .sort((a, b) => Number(b.shift === preferredShift) - Number(a.shift === preferredShift) || b.overlap - a.overlap || a.distance - b.distance);
  return candidates[0].notes;
}

/** Context-only notes removed from the matching major or natural-minor position. */
export function pentatonicOmissions(tonic:number, quality:ScaleQuality, shape:ScalePattern, shift:number, spelling?:string, firstFret=0,lastFret=5){
  if(!quality.endsWith('pentatonic'))return [];
  const parent=isMajorScale(quality)?'major':'minor';
  const omitted=isMajorScale(quality)?[4,7]:[2,6];
  if(shape==='map')return scalePositions(tonic,parent,spelling,firstFret,lastFret).filter(n=>omitted.includes(n.degree));
  // Read the canonical parent first, then clip to the physical neck: its edge
  // notes may extend beyond a valid pentatonic position's own bounds.
  const names=scaleNotes(tonic,parent,spelling);
  return patternPositions(parent==='major'?0:9,parent,shape,0)
    .filter(n=>omitted.includes(n.degree)&&n.fret+shift>=1&&n.fret+shift<=22)
    .map(n=>{const note=names[n.degree-1],midi=n.midi+shift;return {...n,...note,fret:n.fret+shift,midi,octave:(midi-note.natural-note.accidental)/12-1};});
}
