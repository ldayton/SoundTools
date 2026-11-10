import { STRINGS } from "./guitar";

export type ScaleQuality = "major" | "minor";
// Each pitch class uses its usual diatonic key spelling for that scale family.
export const SCALE_TONICS = {
  major: ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
  minor: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
} as const;
export const scaleLabel = (name: string) =>
  name.replace(/#/g, "♯").replace(/b/g, "♭");
const letters = "CDEFGAB";
const natural = [0, 2, 4, 5, 7, 9, 11];
export function scaleNotes(tonic: number, quality: ScaleQuality) {
  if (
    !Number.isInteger(tonic) ||
    tonic < 0 ||
    tonic > 11 ||
    !SCALE_TONICS[quality]
  )
    throw Error("Invalid scale");
  const first = letters.indexOf(SCALE_TONICS[quality][tonic][0]);
  const intervals =
    quality === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return intervals.map((interval, degree) => {
    const letter = (first + degree) % 7;
    const pitchClass = (tonic + interval) % 12;
    const accidental = ((pitchClass - natural[letter] + 18) % 12) - 6;
    const name =
      letters[letter] +
      (accidental < 0 ? "b".repeat(-accidental) : "#".repeat(accidental));
    return {
      name,
      pitchClass,
      degree: degree + 1,
      natural: natural[letter],
      accidental,
    };
  });
}
export function scalePositions(tonic: number, quality: ScaleQuality) {
  const notes = scaleNotes(tonic, quality);
  return [...STRINGS].reverse().flatMap((string) =>
    Array.from({ length: 6 }, (_, fret) => {
      const midi = string.midi + fret;
      const note = notes.find((n) => n.pitchClass === midi % 12);
      return note
        ? {
            ...note,
            string: string.number,
            fret,
            midi,
            octave: (midi - note.natural - note.accidental) / 12 - 1,
            root: note.degree === 1,
            openAlternative:
              fret === 5
                ? STRINGS.find(
                    (next) =>
                      next.number === string.number - 1 && next.midi === midi,
                  )?.number
                : undefined,
          }
        : null;
    }).filter((n) => n !== null),
  );
}
