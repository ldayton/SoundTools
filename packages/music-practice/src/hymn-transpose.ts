// Canonical spellings used by abcjs's notation transposition. The repertoire
// currently contains only major-key hymns; transposition never changes mode.
export const HYMN_KEYS = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;
export type HymnKey = "original" | (typeof HYMN_KEYS)[number];
export function isHymnKey(value: unknown): value is HymnKey {
  return value === "original" || HYMN_KEYS.some((key) => key === value);
}
export function hymnKeyLabel(key: string) {
  return key.replace(/b/g, "♭").replace(/#/g, "♯") + " major";
}
/** Preserve the pre-transposition bookmark namespace for the unchanged source. */
export function hymnKeySuffix(source: string, target: HymnKey) {
  return target === "original" || target === source ? "" : `:key=${target}`;
}
export function hymnTransposition(
  source: string,
  target: HymnKey = "original",
  octave = 0,
) {
  if (!isHymnKey(target)) throw Error("Choose a supported major key.");
  if (!Number.isInteger(octave) || Math.abs(octave) > 10)
    throw Error("Choose a supported octave.");
  if (target === "original" || target === source)
    return { key: source, semitones: octave * 12 };
  const from = HYMN_KEYS.findIndex((key) => key === source);
  if (from < 0)
    throw Error(
      "This source key is not supported for transposition. Choose Original.",
    );
  // Key changes use the nearest register, then shift the entire score by octaves.
  return {
    key: target,
    semitones: ((HYMN_KEYS.indexOf(target) - from + 17) % 12) - 5 + octave * 12,
  };
}
