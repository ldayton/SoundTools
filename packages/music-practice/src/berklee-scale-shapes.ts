import { scalePositions, scaleNotes, isMajorScale, SCALE_FRET_LIMIT, type ScaleQuality } from "./guitar-scales";
import { isMaqam } from "./maqamat";
import { STRINGS } from "./guitar";

export const BERKLEE_SHAPES = [1, 2, 3, 4, 5, 6, 7] as const;
export type BerkleeShape = (typeof BERKLEE_SHAPES)[number];
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
  ).filter((n) => frets[shape - 1][6 - n.string].includes(n.fret - shift));
}
/** Pentatonics retain their parent region; blues add each intervening blue pitch.
 * These are visual derivations, not seven newly published pentatonic/blues grips.
 * No scale fingerings are inferred from the published note-only diagrams. */
export function berkleePositions(tonic: number, quality: ScaleQuality, shape: BerkleeShape, shift: number, spelling?: string) {
  const parent = parentPositions(tonic, quality, shape, shift, spelling);
  const keys = new Set(parent.map(n => `${n.string}:${n.fret}`));
  const [low, high] = berkleeBounds(shape);
  const notes = scalePositions(tonic, quality, spelling, low + shift, high + shift)
    .filter(n => keys.has(`${n.string}:${n.fret}`));
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
      notes.push(scalePositions(tonic, quality, spelling, best.fret, best.fret).find(n => n.string === best.string)!);
    }
  }
  return notes.sort((a,b) => b.string-a.string || a.fret-b.fret);
}
export function berkleeOmissions(tonic: number, quality: ScaleQuality, shape: BerkleeShape, shift: number, spelling?: string) {
  if (!quality.endsWith("pentatonic")) return [];
  const selected = new Set(scaleNotes(tonic, quality, spelling).map(n => n.pitchClass));
  return parentPositions(tonic, quality, shape, shift, spelling).filter(n => !selected.has(n.pitchClass));
}
