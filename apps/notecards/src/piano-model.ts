import { deck, type Card } from "./model";
import type { Profile } from "./exercise-settings";
export const PIANO_POSITIONS = [2, 3, 4, 5, 6].flatMap((o) =>
  [..."CDEFGAB"].map((l) => l + o),
);
const naturals = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const pitch = (card: Card) =>
  12 * (card.octave + 1) + naturals[card.letter] + card.modifier;
export const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);
export function pianoDeck(profile: Profile): Card[] {
  return deck(profile, PIANO_POSITIONS);
}
export function pianoBounds(profile: Profile): [number, number] {
  const notes = pianoDeck(profile).map(pitch);
  // Always retain octave landmarks and plausible alternatives, even for a one-note deck.
  const writtenLow = Number(profile.low.slice(1)),
    writtenHigh = Number(profile.high.slice(1));
  let low = Math.min(...notes),
    high = Math.max(...notes);
  if (high - low < 12) {
    low = Math.min(12 * (writtenLow + 1), low);
    high = Math.max(12 * (writtenHigh + 1) + 11, high);
  }
  if (isBlack(low)) low--;
  if (isBlack(high)) high++;
  // Preserve the existing compact keyboard for extended MIDI practice ranges.
  if (high - low > 24 || low < 48 || high > 84) return [60, 83];
  return [low, high];
}
export function acceptsPiano(card: Card, midi: number) {
  return pitch(card) === midi;
}
export function keyLabel(midi: number, octave = true) {
  return (
    [
      "C",
      "C♯ / D♭",
      "D",
      "D♯ / E♭",
      "E",
      "F",
      "F♯ / G♭",
      "G",
      "G♯ / A♭",
      "A",
      "A♯ / B♭",
      "B",
    ][midi % 12] + (octave ? Math.floor(midi / 12) - 1 : "")
  );
}
