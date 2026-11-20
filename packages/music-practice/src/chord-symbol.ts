import { getChord } from "@tonaljs/chord";

export type ChordTone = {
  note: string;
  pitchClass: number;
  degree: string;
  interval: string;
};
export type ChordDefinition = {
  input: string;
  symbol: string;
  name: string;
  root: { note: string; pitchClass: number };
  bass: { note: string; pitchClass: number } | null;
  tones: ChordTone[];
};
const natural: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
export const pitchClass = (n: number) => ((n % 12) + 12) % 12;
function noteOffset(note: string) {
  if (!/^[A-G](?:#+|b+)?$/.test(note)) throw new Error("Invalid note: " + note);
  return (
    natural[note[0]] +
    [...note.slice(1)].reduce((sum, c) => sum + (c === "#" ? 1 : -1), 0)
  );
}
export function notePitchClass(note: string) {
  return pitchClass(noteOffset(note));
}
export function spellChordMidi(note: string, midi: number) {
  return note + String((midi - noteOffset(note)) / 12 - 1);
}
function degree(interval: string) {
  const [, n, quality] = /^(\d+)([PMmAd])$/.exec(interval)!;
  const perfect = [1, 4, 5].includes(((Number(n) - 1) % 7) + 1);
  const accidental =
    quality === "A"
      ? "#"
      : quality === "m"
        ? "b"
        : quality === "d"
          ? perfect
            ? "b"
            : "bb"
          : "";
  return accidental + n;
}

/** Keep notation identity and slash bass separate from the voicing policy. */
export function parseChordSymbol(input: string): ChordDefinition {
  if (typeof input !== "string" || !input.trim() || input.length > 120)
    throw new Error("Enter a chord symbol (maximum 120 characters)");
  let symbol = input
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, "");
  let depth = 0;
  for (const c of symbol) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth < 0 || (c === "," && depth === 0))
      throw new Error("Expected one chord symbol");
  }
  if (depth !== 0) throw new Error("Unbalanced chord parentheses");
  symbol = symbol
    .replace(/^[a-g]/, (s) => s.toUpperCase())
    .replace(/\/([a-g])(?=[#b]*$)/, (_, s: string) => "/" + s.toUpperCase());
  const bassMatch = /\/([A-G](?:#{1,2}|b{1,2})?)$/.exec(symbol);
  const base = bassMatch ? symbol.slice(0, bassMatch.index) : symbol;
  const rootMatch = /^([A-G](?:#{1,2}|b{1,2})?)(.*)$/.exec(base);
  if (!rootMatch) throw new Error("Unrecognized chord: " + input);
  const [, root, descriptor] = rootMatch;
  const quality = descriptor
    .replace(/Δ(?=\d)/g, "maj")
    .replace(/Δ/g, "maj7")
    .replace(/ø7?/g, "m7b5")
    .replace(/°/g, "dim")
    .replace(/^(?:minor|min)/, "m")
    .replace(/^-/, "m");
  if (/alt/i.test(quality))
    throw new Error(
      "Choose explicit alterations instead of alt (for example C7b9)",
    );
  const chord = getChord(quality, root);
  if (chord.empty || !chord.notes.length)
    throw new Error("Unrecognized chord: " + input);
  return {
    input,
    symbol: root + quality + (bassMatch ? "/" + bassMatch[1] : ""),
    name: chord.name,
    root: { note: root, pitchClass: notePitchClass(root) },
    bass: bassMatch
      ? { note: bassMatch[1], pitchClass: notePitchClass(bassMatch[1]) }
      : null,
    tones: chord.notes.map((note, i) => ({
      note,
      pitchClass: notePitchClass(note),
      interval: chord.intervals[i],
      degree: degree(chord.intervals[i]),
    })),
  };
}

/** Commas inside alterations belong to the chord, not to the search list. */
export function parseChordSymbols(input: string): ChordDefinition[] {
  if (typeof input !== "string" || input.length > 2000)
    throw new Error("Chord search is too long");
  const parts: string[] = [];
  let start = 0,
    depth = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "(") depth++;
    if (input[i] === ")") depth--;
    if (depth < 0) throw new Error("Unbalanced chord parentheses");
    if (input[i] === "," && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  if (depth) throw new Error("Unbalanced chord parentheses");
  parts.push(input.slice(start));
  if (parts.length > 16) throw new Error("Search at most 16 chords at once");
  return parts.map(parseChordSymbol);
}
