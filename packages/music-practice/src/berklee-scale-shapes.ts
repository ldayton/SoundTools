import { scalePositions, scaleNotes, scaleLabel, isMajorScale, SCALE_FRET_LIMIT, type ScaleQuality } from "./guitar-scales";
import { isMaqam } from "./maqamat";
import { STRINGS } from "./guitar";
import type { ChordBarre } from "./guitar-scale-patterns";

export const BERKLEE_SHAPES = [1, 2, 3, 4, 5, 6, 7] as const;
export type BerkleeShape = (typeof BERKLEE_SHAPES)[number];
// Separate from CAGED ScalePattern: CAGED still has exactly five regions.
export type LinkedScaleShape = `${BerkleeShape}` | "none";
export const BERKLEE_7PS_REFERENCE = {
  url: "https://jenslarsen.nl/major-scale-7-positions-berklee-system/",
  label: "Jens Larsen · Berklee 7PS",
};
// Larsen's published C-major chart, top to bottom: F G A B C D E on low E.
// Shape numbers follow that chart order, not scale degrees, in every key.
// These are also Hila's supplied diagrams. Keep the legacy identifiers for
// saved settings and bookmarks. Rows run low E to high E; no fingers are supplied.
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
// App fingerings, not numbers supplied by Larsen's note-only chart. The hand
// positions are II, IV, V, VII, IX, X, XII in C, with an index/pinky extension.
// Berklee position-playing principle: https://online.berklee.edu/takenote/how-to-start-learning-your-guitar-scales/
const fingers = [
  [[1,2,4],[1,2,4],[1,2,4],[1,3,4],[2,4],[1,2,4]],
  [[1,2,4],[1,2,4],[1,2,4],[1,2,4],[2,3],[1,2,4]],
  [[1,3,4],[1,3,4],[1,3,4],[1,3],[1,2,4],[1,3,4]],
  [[1,2,4],[1,2,4],[1,3,4],[1,3,4],[2,4],[1,2,4]],
  [[1,2,4],[1,2,4],[1,2,4],[1,2,4],[2,4],[1,2,4]],
  [[1,3,4],[1,3,4],[1,3,4],[1,3],[1,3,4],[1,3,4]],
  [[1,2,4],[1,3,4],[1,3,4],[1,3],[1,2,4],[1,2,4]],
];
export function berkleeBounds(shape: BerkleeShape) {
  const row = frets[shape - 1].flat();
  return [Math.min(...row), Math.max(...row)] as const;
}
export function berkleeShift(tonic: number, quality: ScaleQuality, shape: BerkleeShape, preferred?: number) {
  if (isMaqam(quality)) throw Error("Maqamat have separate hand positions");
  const [low, high] = berkleeBounds(shape);
  // C major / A natural minor share the exact published regions and numbers.
  const delta = tonic - (isMajorScale(quality) ? 0 : 9);
  const candidates = [delta, delta - 12, delta + 12].filter(
    (s) => low + s >= 1 && high + s <= SCALE_FRET_LIMIT,
  );
  return candidates.includes(preferred!) ? preferred! : candidates[0];
}
function parentPositions(
  tonic: number,
  quality: ScaleQuality,
  shape: BerkleeShape,
  shift: number,
  spelling?: string,
) {
  if (berkleeShift(tonic, quality, shape, shift) !== shift)
    throw Error("Invalid Berklee 7PS position");
  const [low, high] = berkleeBounds(shape);
  return scalePositions(
    tonic,
    isMajorScale(quality) ? "major" : "minor",
    spelling,
    low + shift,
    high + shift,
  ).filter((n) => frets[shape - 1][6 - n.string].includes(n.fret - shift))
    .map(n => ({...n, openAlternative:undefined, finger:fingers[shape-1][6-n.string][frets[shape-1][6-n.string].indexOf(n.fret-shift)]}));
}
/** Pentatonics retain their parent region; blues add each intervening blue pitch.
 * These are visual derivations, not seven newly published pentatonic/blues grips.
 * Parent fingers are retained; blue notes use a spare finger or one-fret slide. */
export function berkleePositions(tonic: number, quality: ScaleQuality, shape: BerkleeShape, shift: number, spelling?: string) {
  const parent = parentPositions(tonic, quality, shape, shift, spelling);
  const keys = new Set(parent.map(n => `${n.string}:${n.fret}`));
  const [low, high] = berkleeBounds(shape);
  const notes = scalePositions(tonic, quality, spelling, low + shift, high + shift)
    .filter(n => keys.has(`${n.string}:${n.fret}`))
    .map(n => ({...n, openAlternative:undefined, finger:parent.find(p=>p.string===n.string&&p.fret===n.fret)!.finger}));
  if (quality.endsWith("blues")) {
    const blue = (tonic + (isMajorScale(quality) ? 3 : 6)) % 12;
    const first = Math.min(...notes.map(n => n.midi)), last = Math.max(...notes.map(n => n.midi));
    for (let midi = first; midi <= last; midi++) {
      if (midi % 12 !== blue) continue;
      // Prefer the published window and a neighbouring scale note. At an edge,
      // use a one-fret extension on an available string, never an omitted pitch.
      const candidates = STRINGS.flatMap(s => {
        const fret = midi - s.midi;
        if (fret < 1 || fret > SCALE_FRET_LIMIT) return [];
        if (notes.some(n => n.string > s.number && n.midi >= midi || n.string < s.number && n.midi <= midi)) return [];
        const extension = Math.max(low + shift - fret, fret - high - shift, 0);
        const distance = Math.min(...notes.filter(n => n.string === s.number).map(n => Math.abs(n.fret - fret)));
        return [{string:s.number, fret, extension, distance}];
      }).sort((a,b) => a.extension-b.extension || a.distance-b.distance || a.string-b.string);
      const best = candidates[0];
      if (!best || best.extension > 1) throw Error("No adjacent blue-note location in Berklee region");
      const row=notes.filter(n=>n.string===best.string).sort((a,b)=>a.fret-b.fret);
      const before=[...row].reverse().find(n=>n.fret<best.fret), after=row.find(n=>n.fret>best.fret);
      const finger=before&&after&&after.finger-before.finger>1 ? before.finger+1
        : before&&!after&&before.finger<4 ? before.finger+1
        : after&&!before&&after.finger>1 ? after.finger-1
        : before&&best.fret-before.fret===1 ? before.finger
        : after&&after.fret-best.fret===1 ? after.finger
        : (()=>{throw Error("Blue note needs an explicit playable fingering");})();
      notes.push({...scalePositions(tonic,quality,spelling,best.fret,best.fret).find(n=>n.string===best.string)!,openAlternative:undefined,finger});
    }
  }
  return notes.sort((a,b) => b.string-a.string || a.fret-b.fret);
}
export function berkleeOmissions(tonic: number, quality: ScaleQuality, shape: BerkleeShape, shift: number, spelling?: string) {
  if (!quality.endsWith("pentatonic")) return [];
  const selected = new Set(scaleNotes(tonic, quality, spelling).map(n => n.pitchClass));
  return parentPositions(tonic, quality, shape, shift, spelling).filter(n => !selected.has(n.pitchClass));
}

/** Same overlap-first octave placement as CAGED, bounded by the AP66 neck. */
export function linkedBerkleePosition(tonic:number, quality:ScaleQuality, shape:BerkleeShape, shift:number, linked:BerkleeShape, spelling?:string, preferredShift?:number) {
  const primary=berkleePositions(tonic,quality,shape,shift,spelling);
  const keys=new Set(primary.map(n=>`${n.string}:${n.fret}`));
  const delta=tonic-(isMajorScale(quality)?0:9);
  return [delta-12,delta,delta+12]
    .filter(s=>berkleeShift(tonic,quality,linked,s)===s)
    .map(s=>{
      const notes=berkleePositions(tonic,quality,linked,s,spelling);
      return {notes,shift:s,overlap:notes.filter(n=>keys.has(`${n.string}:${n.fret}`)).length,
        distance:Math.abs(Math.min(...notes.map(n=>n.fret))-Math.min(...primary.map(n=>n.fret)))};
    })
    .sort((a,b)=>Number(b.shift===preferredShift)-Number(a.shift===preferredShift)||b.overlap-a.overlap||a.distance-b.distance)[0];
}

type TriadGrip = { notes: readonly (readonly [string:number,fret:number,finger:number])[]; barres?: ChordBarre[] };
// Reviewed, simultaneously playable tonic triads within each published C-major /
// A-minor region. These are app voicings, not seven CAGED forms. Scale fingers
// describe a melodic run; these independent grip fingers describe a held chord.
const majorTriads: readonly TriadGrip[] = [
  {notes:[[3,5,3],[2,5,4],[1,3,1]]},
  {notes:[[3,5,3],[2,5,4],[1,3,1]]},
  {notes:[[4,5,1],[3,5,1],[2,5,1]],barres:[{finger:1,fret:5,fromString:4,toString:2}]},
  {notes:[[3,9,2],[2,8,1],[1,8,1]],barres:[{finger:1,fret:8,fromString:2,toString:1}]},
  {notes:[[5,10,2],[4,10,3],[3,9,1]]},
  {notes:[[3,12,1],[2,13,2],[1,12,1]],barres:[{finger:1,fret:12,fromString:3,toString:1}]},
  {notes:[[3,12,1],[2,13,2],[1,12,1]],barres:[{finger:1,fret:12,fromString:3,toString:1}]},
];
const minorTriads: readonly TriadGrip[] = [
  {notes:[[5,3,2],[4,2,1],[3,2,1]],barres:[{finger:1,fret:2,fromString:4,toString:3}]},
  {notes:[[4,7,3],[3,5,1],[2,5,1]],barres:[{finger:1,fret:5,fromString:3,toString:2}]},
  {notes:[[3,5,1],[2,5,1],[1,5,1]],barres:[{finger:1,fret:5,fromString:3,toString:1}]},
  {notes:[[4,7,1],[3,9,3],[1,8,2]]},
  {notes:[[3,9,2],[2,10,3],[1,8,1]]},
  {notes:[[4,10,1],[2,10,2],[1,12,4]]},
  {notes:[[3,14,3],[2,13,2],[1,12,1]]},
];
export function berkleeChordDiagram(tonic:number, quality:ScaleQuality, shape:BerkleeShape, shift:number, spelling?:string) {
  if(isMaqam(quality))throw Error("Maqamat have separate hand positions");
  const grip=(isMajorScale(quality)?majorTriads:minorTriads)[shape-1];
  return {
    name:`${scaleLabel(scaleNotes(tonic,quality,spelling)[0].name)} ${isMajorScale(quality)?"major":"minor"} · Shape ${shape}`,
    frets:[6,5,4,3,2,1].map(string=>{const n=grip.notes.find(n=>n[0]===string);return n?n[1]+shift:null;}),
    fingers:[6,5,4,3,2,1].map(string=>grip.notes.find(n=>n[0]===string)?.[2]??null),
    barres:(grip.barres||[]).map(b=>({...b,fret:b.fret+shift})),
  };
}
