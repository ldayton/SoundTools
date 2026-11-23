import {isMaqam} from "./maqamat";
import { STRINGS } from "./guitar";
import { isMajorScale, scaleLabel, scaleNotes, scalePositions, type ScaleQuality } from "./guitar-scales";

export const SCALE_SHAPES = ["1", "2", "3", "4", "5"] as const;
export type ScaleShape = (typeof SCALE_SHAPES)[number];
export type ScalePattern = ScaleShape | "map";
// IDs remain stable for saved practice state and existing numbered URLs.
export const CAGED_SHAPES = ["3", "4", "5", "1", "2"] as const;
// One publisher for all Western scale references. Its charts are numbered;
// our CAGED form names are identified by the embedded tonic chord below.
export function cagedScaleSource(quality: ScaleQuality) {
  if (isMaqam(quality)) throw Error('Maqamat have separate references');
  const pages = {
    major: 'c-major.html', minor: 'a-minor.html',
    'major-pentatonic': 'c-pentatonic-major.html',
    'minor-pentatonic': 'a-pentatonic-minor.html',
    'major-blues': 'c-blues.html', 'minor-blues': 'a-blues.html',
  };
  return {
    url: `https://www.guitarscale.org/${pages[quality]}`,
    label: quality === 'major-blues'
      ? 'GuitarScale.org · major-blues formula (Related scales)'
      : 'GuitarScale.org',
  };
}
function chordForm(shape: ScaleShape) {
  return { "1": "E", "2": "D", "3": "C", "4": "A", "5": "G" }[shape];
}
export function scaleShapeLabel(shape: ScalePattern | "none", quality: ScaleQuality): string {
  if (shape === "map") return "Fret range";
  if (shape === "none") return "Single shape";
  const chord = chordForm(shape);
  return `${chord}${isMajorScale(quality) ? "" : "m"} shape`;
}
export type ChordBarre = { finger: number; fret: number; fromString: number; toString: number };
type ChordGrip = {
  // Frets and fingers are one reviewed grip, not scale-note finger assignments.
  strings: (readonly [fret: number, finger: number] | null)[];
  barres: ChordBarre[];
};
const majorChordGrips: Record<ScaleShape, ChordGrip> = {
  "1": { strings: [[8,1],[10,3],[10,4],[9,2],[8,1],[8,1]], barres: [{finger:1,fret:8,fromString:6,toString:1}] },
  "2": { strings: [null,null,[10,1],[12,2],[13,4],[12,3]], barres: [] },
  "3": { strings: [null,[15,4],[14,3],[12,1],[13,2],[12,1]], barres: [{finger:1,fret:12,fromString:3,toString:1}] },
  "4": { strings: [null,[3,1],[5,2],[5,3],[5,4],[3,1]], barres: [{finger:1,fret:3,fromString:5,toString:1}] },
  "5": { strings: [[8,3],[7,2],[5,1],[5,1],[5,1],[8,4]], barres: [{finger:1,fret:5,fromString:4,toString:2}] },
};
const minorChordGrips: Record<ScaleShape, ChordGrip> = {
  "1": { strings: [[5,1],[7,3],[7,4],[5,1],[5,1],[5,1]], barres: [{finger:1,fret:5,fromString:6,toString:1}] },
  "2": { strings: [null,null,[7,1],[9,3],[10,4],[8,2]], barres: [] },
  // Playable Cm-form fragment; the full five-note grip needs an extra finger.
  "3": { strings: [null,[12,4],[10,2],[9,1],[10,3],null], barres: [] },
  "4": { strings: [null,[12,1],[14,3],[14,4],[13,2],[12,1]], barres: [{finger:1,fret:12,fromString:5,toString:1}] },
  "5": { strings: [[5,3],[3,2],[2,1],[2,1],[5,4],[5,4]], barres: [{finger:1,fret:2,fromString:4,toString:3},{finger:4,fret:5,fromString:2,toString:1}] },
};
function chordGrip(shape: ScaleShape, quality: ScaleQuality) {
  return (isMajorScale(quality) ? majorChordGrips : minorChordGrips)[shape];
}
/** The chord voicing anchoring each position, low E through high E. */
export function cagedChordPositions(shape: ScaleShape, quality: ScaleQuality, shift: number) {
  return chordGrip(shape,quality).strings.flatMap((note,row) =>
    note === null ? [] : [{string:6-row,fret:note[0]+shift}]);
}
/** Chord grip at the outlined scale frets. Chord fingers differ from scale fingers. */
export function cagedChordDiagram(tonic:number, quality:ScaleQuality, shape:ScaleShape, shift:number, spelling?:string) {
  const grip=chordGrip(shape,quality);
  const frets=grip.strings.map(note=>note===null?null:note[0]+shift);
  const moved=Math.min(...frets.filter((f):f is number=>f!==null));
  const form=`Open ${chordForm(shape)} ${isMajorScale(quality)?'major':'minor'}`;
  return {
    name:`${scaleLabel(scaleNotes(tonic,quality,spelling)[0].name)} ${isMajorScale(quality)?'major':'minor'} · ${scaleShapeLabel(shape,quality)}`,
    explanation:moved===0?`${form} form.`:`${form} moved up ${moved} ${moved===1?'fret':'frets'}.`,
    frets,
    fingers:grip.strings.map((note,i)=>note===null||frets[i]===0?null:note[1]),
    barres:grip.barres.map(barre=>({...barre,fret:barre.fret+shift})).filter(barre=>barre.fret>0),
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
// Conventional two-note-per-string boxes, independently fingered from the
// full scales. GuitarScale.org /a-pentatonic-minor.html, shapes 1–5.
// C major shares A minor's coordinates, with a different tonic/chord anchor.
const minorPentatonic: Record<ScaleShape, Fingering> = {
  "1": { frets:[[5,8],[5,7],[5,7],[5,7],[5,8],[5,8]],
    fingers:[[1,4],[1,3],[1,3],[1,3],[1,4],[1,4]] },
  "2": { frets:[[8,10],[7,10],[7,10],[7,9],[8,10],[8,10]],
    fingers:[[2,4],[1,4],[1,4],[1,3],[1,3],[1,3]] },
  "3": { frets:[[10,12],[10,12],[10,12],[9,12],[10,13],[10,12]],
    fingers:[[1,3],[1,3],[1,3],[1,3],[1,4],[1,3]] },
  "4": { frets:[[12,15],[12,15],[12,14],[12,14],[13,15],[12,15]],
    fingers:[[1,4],[1,4],[1,3],[1,3],[2,4],[1,4]] },
  "5": { frets:[[3,5],[3,5],[2,5],[2,5],[3,5],[3,5]],
    fingers:[[1,3],[1,3],[1,4],[1,4],[1,3],[1,3]] },
};
const majorPentatonic = Object.fromEntries(SCALE_SHAPES.map(shape =>
  [shape, minorPentatonic[relativePattern(shape,"major")]])) as Record<ScaleShape,Fingering>;
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
  // These charts publish locations, not per-dot fingers. Our adaptation keeps
  // pentatonic fingers and uses a spare finger or an explicit one-fret slide.
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
          : before && !after && before.finger < 4 ? before.finger + 1
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
  // Show the omitted degrees within the actual box window, including notes
  // on alternative strings. The full-scale fingering is a different layout.
  const [low,high]=patternBounds(shape,quality);
  return scalePositions(tonic,parent,spelling,low+shift,high+shift)
    .filter(n=>omitted.includes(n.degree));
}
