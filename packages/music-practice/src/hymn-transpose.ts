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
) {
  if (!isHymnKey(target)) throw Error("Choose a supported major key.");
  if (target === "original" || target === source)
    return { key: source, semitones: 0 };
  const from = HYMN_KEYS.findIndex((key) => key === source);
  if (from < 0)
    throw Error(
      "This source key is not supported for transposition. Choose Original.",
    );
  // Nearest register: at most five semitones down or six up. No octave folding.
  return {
    key: target,
    semitones: ((HYMN_KEYS.indexOf(target) - from + 17) % 12) - 5,
  };
}
