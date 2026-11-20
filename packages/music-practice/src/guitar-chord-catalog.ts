import { parseChordSymbol, type ChordDefinition } from "./chord-symbol";
export type FamiliarShape = {
  chord: ChordDefinition;
  frets: (number | null)[];
  fingers: (number | null)[];
  name: string;
  familiarity:
    | "standard-open"
    | "standard-compact"
    | "common-variation"
    | "standard-movable";
  preference: number;
};
// Independently written conventional teaching shapes; no diagrams/database copied.
// Both vectors run LOW E to HIGH E. Finger zero is open; null is muted.
const open: readonly (readonly [string, string, string, string, number?])[] = [
  ["C", "x32010", "032010", "Open C"],
  ["G", "320003", "210003", "Open G"],
  ["G", "320033", "210034", "Four-finger open G", 1],
  ["D", "xx0232", "000132", "Open D"],
  ["A", "x02220", "001230", "Open A"],
  ["E", "022100", "023100", "Open E"],
  ["Am", "x02210", "002310", "Open A minor"],
  ["Em", "022000", "023000", "Open E minor"],
  ["Dm", "xx0231", "000231", "Open D minor"],
  ["F", "xx321x", "003210", "Small F"],
  ["F", "xx3211", "003211", "Four-string F mini-barre", 1],
  ["A7", "x02020", "002030", "Open A7"],
  ["E7", "020100", "020100", "Open E7"],
  ["D7", "xx0212", "000213", "Open D7"],
  ["G7", "320001", "320001", "Open G7"],
  ["B7", "x21202", "021304", "Open B7"],
  ["C7", "x32310", "032410", "Open C7"],
  ["Am7", "x02010", "002010", "Open A minor 7"],
  ["Em7", "020000", "020000", "Open E minor 7"],
  ["Dm7", "xx0211", "000211", "Open D minor 7"],
  ["Cmaj7", "x32000", "032000", "Open C major 7"],
  ["Cmaj9", "x30000", "030000", "Open C major 9"],
  ["Amaj7", "x02120", "002130", "Open A major 7"],
  ["Dmaj7", "xx0222", "000111", "Open D major 7"],
  ["Emaj7", "021100", "031200", "Open E major 7"],
  ["Fmaj7", "xx3210", "003210", "Open F major 7"],
  ["Cadd9", "x32033", "021034", "Open C add9"],
  ["Dsus2", "xx0230", "000130", "Open D sus2"],
  ["Dsus4", "xx0233", "000134", "Open D sus4"],
  ["Asus2", "x02200", "002300", "Open A sus2"],
  ["Asus4", "x02230", "001240", "Open A sus4"],
  ["A5", "x022xx", "001100", "Open A power chord"],
  ["E5", "022xxx", "023000", "Open E power chord"],
  ["D5", "xx023x", "000130", "Open D power chord"],
  ["C6", "x32210", "042310", "Open C sixth"],
];
function fingersFor(frets: readonly (number | null)[], fingers: string) {
  return frets.map((f, i) =>
    f === null ? null : f === 0 ? 0 : Number(fingers[i]),
  );
}
export const OPEN_CHORD_SHAPES: readonly FamiliarShape[] = open.map(
  ([symbol, text, fingers, name, preference = 0]) => {
    const frets = [...text].map((f) => (f === "x" ? null : Number(f)));
    return {
      chord: parseChordSymbol(symbol),
      frets,
      fingers: fingersFor(frets, fingers),
      name,
      familiarity: preference
        ? "common-variation"
        : frets.includes(0)
          ? "standard-open"
          : "standard-compact",
      preference,
    };
  },
);
const templates: readonly (readonly [
  string,
  number,
  readonly (number | null)[],
  string,
  string,
])[] = [
  ["", 4, [0, 2, 2, 1, 0, 0], "134211", "Six-string major barre"],
  ["m", 4, [0, 2, 2, 0, 0, 0], "134111", "Six-string minor barre"],
  ["7", 4, [0, 2, 0, 1, 0, 0], "131211", "Six-string seventh barre"],
  ["m7", 4, [0, 2, 0, 0, 0, 0], "131111", "Six-string minor seventh barre"],
  ["maj7", 4, [0, 2, 1, 1, 0, 0], "132211", "Six-string major seventh barre"],
  ["5", 4, [0, 2, 2, null, null, null], "134000", "Sixth-string power chord"],
  ["5", 9, [null, 0, 2, 2, null, null], "013400", "Fifth-string power chord"],
  ["", 9, [null, 0, 2, 2, 2, 0], "013331", "Five-string major barre"],
  ["m", 9, [null, 0, 2, 2, 1, 0], "013421", "Five-string minor barre"],
  ["7", 9, [null, 0, 2, 0, 2, 0], "013141", "Five-string seventh barre"],
  ["m7", 9, [null, 0, 2, 0, 1, 0], "013121", "Five-string minor seventh barre"],
  [
    "maj7",
    9,
    [null, 0, 2, 1, 2, 0],
    "013241",
    "Five-string major seventh barre",
  ],
  ["9", 9, [null, 0, -1, 0, 0, 0], "021333", "Five-string ninth shape"],
  ["13", 9, [null, 0, -1, 0, 0, 2], "021334", "Five-string thirteenth shape"],
  [
    "maj9",
    9,
    [null, 0, -1, 1, 0, null],
    "021430",
    "Four-string major ninth shape",
  ],
  [
    "m9",
    9,
    [null, 0, -2, 0, 0, null],
    "021340",
    "Four-string minor ninth shape",
  ],
];
const signature = (chord: ChordDefinition) =>
  chord.tones.map((t) => t.interval).join(",");
export function familiarGuitarShapes(chord: ChordDefinition): FamiliarShape[] {
  const result = OPEN_CHORD_SHAPES.filter(
    (s) =>
      s.chord.root.pitchClass === chord.root.pitchClass &&
      signature(s.chord) === signature(chord),
  );
  for (const [quality, root, offsets, fingers, name] of templates) {
    if (signature(parseChordSymbol("C" + quality)) !== signature(chord))
      continue;
    const first = (chord.root.pitchClass - root + 12) % 12;
    for (let base = first || 12; base <= 24; base += 12) {
      const frets = offsets.map((f) => (f === null ? null : f + base));
      if (frets.some((f) => f !== null && (f < 0 || f > 24))) continue;
      result.push({
        chord,
        frets,
        fingers: fingersFor(frets, fingers),
        name,
        familiarity: "standard-movable",
        preference: 0,
      });
    }
  }
  return result;
}
