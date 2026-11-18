import { STRINGS } from "./guitar";

export const SCALE_QUALITIES = ["major", "minor", "major-pentatonic", "minor-pentatonic"] as const;
export type ScaleQuality = typeof SCALE_QUALITIES[number];
export const isMajorScale = (quality: ScaleQuality) => quality.startsWith("major");
export const scaleQualityLabel = (quality: ScaleQuality) => ({ major: "major", minor: "natural minor", "major-pentatonic": "major pentatonic", "minor-pentatonic": "minor pentatonic" })[quality];
// Each pitch class uses its usual diatonic key spelling for that scale family.
const diatonicTonics = {
  major: ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
  minor: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
} as const;
export const SCALE_TONICS = { ...diatonicTonics, "major-pentatonic": diatonicTonics.major, "minor-pentatonic": diatonicTonics.minor };
export type ScaleSelection = {
  tonic: number;
  quality: ScaleQuality;
  spelling?: string;
};
const aliases = { major: ["C#", "Gb", "Cb"], minor: ["D#", "Ab", "A#"] };
export function scaleKeyPitch(name: string, quality: ScaleQuality) {
  if (![...SCALE_TONICS[quality], ...aliases[isMajorScale(quality) ? "major" : "minor"]].includes(name))
    return -1;
  return (
    (natural[letters.indexOf(name[0])] +
      (name.endsWith("#") ? 1 : name.endsWith("b") ? -1 : 0) +
      12) %
    12
  );
}
export const scaleLabel = (name: string) =>
  name.replace(/#/g, "♯").replace(/b/g, "♭");
const letters = "CDEFGAB";
const natural = [0, 2, 4, 5, 7, 9, 11];
export function scaleNotes(
  tonic: number,
  quality: ScaleQuality,
  spelling?: string,
) {
  if (
    !Number.isInteger(tonic) ||
    tonic < 0 ||
    tonic > 11 ||
    !SCALE_TONICS[quality] ||
    (spelling !== undefined && scaleKeyPitch(spelling, quality) !== tonic)
  )
    throw Error("Invalid scale");
  const first = letters.indexOf((spelling || SCALE_TONICS[quality][tonic])[0]);
  const intervals =
    isMajorScale(quality) ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const degrees = quality === "major-pentatonic" ? [0, 1, 2, 4, 5] : quality === "minor-pentatonic" ? [0, 2, 3, 4, 6] : [0, 1, 2, 3, 4, 5, 6];
  return degrees.map((degree) => {
    const interval = intervals[degree];
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
export function relativeScale(
  tonic: number,
  quality: ScaleQuality,
  spelling?: string,
): ScaleSelection {
  const major = isMajorScale(quality);
  const note = scaleNotes(tonic, quality, spelling).find(n => n.degree === (major ? 6 : 3))!;
  const target: ScaleQuality = quality.endsWith("pentatonic") ? (major ? "minor-pentatonic" : "major-pentatonic") : (major ? "minor" : "major");
  return {
    tonic: note.pitchClass,
    quality: target,
    ...(note.name !== SCALE_TONICS[target][note.pitchClass]
      ? { spelling: note.name }
      : {}),
  };
}
export function scalePositions(
  tonic: number,
  quality: ScaleQuality,
  spelling?: string,
) {
  const notes = scaleNotes(tonic, quality, spelling);
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
