import { noteName } from './note-spelling';

export type CollectionFamily = 'rast' | 'bayati' | 'sikah';
export type CollectionExtent = 3 | 4 | 5 | 8;
const LAMBERT = 'https://wom-journal.org/wom/article/download/1426/1432?inline=1';
const source = (family: CollectionFamily) => `https://www.maqamworld.com/en/jins/${family}.php`;
function collection(
  name: string,
  family: CollectionFamily,
  extent: CollectionExtent,
  offsetsCents: readonly number[],
  degreeSpellings: readonly number[],
  octaveEquivalent: boolean
) {
  return {
    name,
    family,
    extent,
    offsetsCents,
    degreeSpellings,
    homeIndex: 0,
    octaveEquivalent,
    tuningModel: 'quarter-tone-reference' as const,
    sources: family === 'rast' ? [LAMBERT, source(family)] : [source(family)],
    evidence:
      family === 'rast'
        ? 'Related pitch collections are documented in Jewish women’s songs from Dhamar; these exercises use authored reference tuning and home.'
        : 'General modal practice; not established here as a named Jewish Yemenite teaching category.',
  };
}
// Explicit authored fragments. An octave is never inferred from a short array.
export const YEMENITE_COLLECTIONS = {
  'rast-tetrachord': collection(
    'Rast tetrachord',
    'rast',
    4,
    [0, 200, 350, 500],
    [0, 1, 2, 3],
    false
  ),
  'rast-pentachord': collection(
    'Rast pentachord',
    'rast',
    5,
    [0, 200, 350, 500, 700],
    [0, 1, 2, 3, 4],
    false
  ),
  'rast-octave': collection(
    'Rast octave',
    'rast',
    8,
    [0, 200, 350, 500, 700, 900, 1050, 1200],
    [0, 1, 2, 3, 4, 5, 6, 7],
    true
  ),
  'bayati-tetrachord': collection(
    'Bayati tetrachord',
    'bayati',
    4,
    [0, 150, 300, 500],
    [0, 1, 2, 3],
    false
  ),
  'bayati-pentachord': collection(
    'Bayati pentachord',
    'bayati',
    5,
    [0, 150, 300, 500, 700],
    [0, 1, 2, 3, 4],
    false
  ),
  'bayati-octave': collection(
    'Bayati octave',
    'bayati',
    8,
    [0, 150, 300, 500, 700, 800, 1000, 1200],
    [0, 1, 2, 3, 4, 5, 6, 7],
    true
  ),
  'sikah-trichord': collection('Sikah trichord', 'sikah', 3, [0, 150, 350], [0, 1, 2], false),
} as const;
export type YemeniteCollection = keyof typeof YEMENITE_COLLECTIONS;
export const DEFAULT_YEMENITE_COLLECTION: YemeniteCollection = 'bayati-octave';
export function selectedCollection(spec: { yemeniteCollection?: YemeniteCollection }) {
  return YEMENITE_COLLECTIONS[spec.yemeniteCollection ?? DEFAULT_YEMENITE_COLLECTION];
}
export function collectionOffsets(spec: { yemeniteCollection?: YemeniteCollection }) {
  const collection = selectedCollection(spec);
  return collection.offsetsCents.map(
    (cents) => (cents - collection.offsetsCents[collection.homeIndex]) / 100
  );
}
export function collectionChoice(
  family: CollectionFamily,
  extent: CollectionExtent
): YemeniteCollection {
  const candidates = Object.entries(YEMENITE_COLLECTIONS).filter(
    ([, item]) => item.family === family
  );
  const choice =
    candidates.find(([, item]) => item.extent === extent) ??
    candidates.find(([, item]) => item.extent === 5) ??
    candidates[0];
  return choice[0] as YemeniteCollection;
}
/** Keep the authored degree letter, including neutral thirds after transposition. */
export function collectionNoteName(midi: number, tonic: number, id: YemeniteCollection): string {
  const collection = YEMENITE_COLLECTIONS[id];
  const fallback = () => noteName(midi, Number.isInteger(tonic) ? tonic : undefined);
  const offsets = collectionOffsets({ yemeniteCollection: id });
  const index = offsets.findIndex((offset) => Math.abs(midi - tonic - offset) < 1e-6);
  const home = /^([A-G])(?:[♯♭𝄲𝄳])?(-?\d+)$/u.exec(noteName(tonic));
  if (index < 0 || !home) return fallback();
  const letters = 'CDEFGAB';
  const letterIndex =
    letters.indexOf(home[1]) +
    collection.degreeSpellings[index] -
    collection.degreeSpellings[collection.homeIndex];
  const letter = letters[((letterIndex % 7) + 7) % 7];
  const octave = Number(home[2]) + Math.floor(letterIndex / 7);
  const natural = (octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][letters.indexOf(letter)];
  const symbols: Record<string, string> = { '-1': '♭', '-0.5': '𝄳', '0': '', '0.5': '𝄲', '1': '♯' };
  const accidental = symbols[String(midi - natural)];
  return accidental === undefined ? fallback() : `${letter}${accidental}${octave}`;
}
