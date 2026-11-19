import type { TuneObject } from "abcjs";

/** Omit unchanged system headers during engraving, then restore the musical
 * keys before abcjs resolves accidentals for playback and MIDI grading. */
export function initialHymnSignatures(tune: TuneObject): () => void {
  type Staff = NonNullable<TuneObject["lines"][number]["staff"]>[number];
  const originals: [Staff, Staff["key"]][] = [];
  const previous = new Map<number, string>();
  for (const line of tune.lines)
    line.staff?.forEach((staff, index) => {
      const key = staff.key;
      if (!key) return;
      const signature = JSON.stringify([
        key.root,
        key.acc,
        key.mode,
        (key.accidentals || [])
          .filter(({ acc }) => acc !== "natural")
          .map(({ acc, note }) => [acc, note]),
      ]);
      if (previous.get(index) === signature) {
        originals.push([staff, key]);
        staff.key = { ...key, accidentals: [] };
      }
      previous.set(index, signature);
    });
  return () => {
    for (const [staff, key] of originals) staff.key = key;
  };
}
