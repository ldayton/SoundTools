import {
  KEYS,
  type Card,
  type Letter,
  type Modifier,
  type Settings,
} from "./model";
export const MODES = [
  { id: "staff", label: "Read staff" },
  { id: "name", label: "Name the note" },
  { id: "find", label: "Find the note" },
  { id: "staff-find", label: "Staff to fretboard" },
  { id: "tab", label: "Read tab" },
  { id: "piano", label: "Find on piano" },
  { id: "signature", label: "Read key signatures" },
] as const;
export type Mode = (typeof MODES)[number]["id"];
export const STRINGS = [
  { number: 1, name: "High E", midi: 64 },
  { number: 2, name: "B", midi: 59 },
  { number: 3, name: "G", midi: 55 },
  { number: 4, name: "D", midi: 50 },
  { number: 5, name: "A", midi: 45 },
  { number: 6, name: "Low E", midi: 40 },
];
export type Profile = Settings & {
  strings: number[];
  minFret: number;
  maxFret: number;
  naturalsOnly?: boolean;
  pianoPrompt?: "staff" | "name";
  staffLayout?: "treble" | "bass" | "grand";
  overlapPractice?: "standard" | "both";
  octavePractice?: "off" | "practice";
  signaturePractice?: "major" | "minor" | "both";
};
export type GuitarCard = Card & { string: number; fret: number; midi: number };
const natural: Record<Letter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
export function midiAt(string: number, fret: number) {
  const tuning = STRINGS.find((s) => s.number === string);
  if (!tuning || !Number.isInteger(fret) || fret < 0 || fret > 12)
    throw Error("Invalid guitar position");
  return tuning.midi + fret;
}
export function spellPitch(midi: number, key: string): Card | null {
  const signature = KEYS.find((k) => k.id === key);
  if (!signature) throw Error("Invalid key");
  const altered = (signature.count < 0 ? "BEADGCF" : "FCGDAEB").slice(
    0,
    Math.abs(signature.count),
  );
  for (const letter of Object.keys(natural) as Letter[]) {
    const modifier: Modifier = altered.includes(letter)
      ? signature.count < 0
        ? -1
        : 1
      : 0;
    if ((natural[letter] + modifier + 12) % 12 !== midi % 12) continue;
    const octave = (midi - natural[letter] - modifier) / 12 - 1;
    return { id: `${letter}${octave}:${modifier}`, letter, octave, modifier };
  }
  return null;
}
const CHROMATIC = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];
export function chromaticPitch(midi: number): Card {
  const spelling = CHROMATIC[midi % 12];
  const letter = spelling[0] as Letter,
    modifier: Modifier = spelling.includes("♯")
      ? 1
      : spelling.includes("♭")
        ? -1
        : 0;
  const octave = Math.floor(midi / 12) - 1;
  return { id: `${letter}${octave}:${modifier}`, letter, octave, modifier };
}
export function guitarDeck(profile: Profile, chromatic = false): GuitarCard[] {
  const { minFret, maxFret, strings } = profile;
  if (
    !Number.isInteger(minFret) ||
    !Number.isInteger(maxFret) ||
    minFret < 0 ||
    maxFret > 12 ||
    maxFret < minFret ||
    !strings.length ||
    strings.some((n) => !STRINGS.some((s) => s.number === n))
  )
    throw Error("Invalid guitar range");
  return STRINGS.filter((s) => strings.includes(s.number)).flatMap((s) =>
    Array.from({ length: maxFret - minFret + 1 }, (_, i) => {
      const fret = minFret + i,
        midi = midiAt(s.number, fret),
        card = chromatic ? chromaticPitch(midi) : spellPitch(midi, profile.key);
      return card
        ? { ...card, id: `${s.number}:${fret}`, string: s.number, fret, midi }
        : null;
    }).filter((c): c is GuitarCard => c !== null),
  );
}
export function acceptsLocation(
  card: GuitarCard,
  string: number,
  fret: number,
  exactOctave: boolean,
) {
  if (string !== card.string) return false;
  const pitch = midiAt(string, fret);
  return exactOctave ? pitch === card.midi : pitch % 12 === card.midi % 12;
}
export function locations(
  card: GuitarCard,
  profile: Profile,
  exactOctave: boolean,
) {
  return guitarDeck(profile).filter((c) =>
    acceptsLocation(card, c.string, c.fret, exactOctave),
  );
}
export const isLocationMode = (mode: Mode) =>
  mode === "find" || mode === "staff-find";
export function locationLabel(string: number, fret: number) {
  return `String ${string}, ${fret === 0 ? "open" : `fret ${fret}`}`;
}

// A find question asks for a pitch class, not a particular octave/location.
// Deduplicate octave equivalents so the same prompt does not appear as two cards.
export function guitarQuestions(mode: Mode, profile: Profile): GuitarCard[] {
  const cards = guitarDeck(profile, mode === "name").filter(
    (card) => mode !== "name" || !profile.naturalsOnly || card.modifier === 0,
  );
  if (mode !== "find") return cards;
  const seen = new Set<string>();
  return cards.flatMap((card) => {
    const id = `${card.string}:${card.midi % 12}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ ...card, id }];
  });
}
