import type { TuneObject } from "abcjs";

/** Omit unchanged system headers during engraving, then restore the musical
 * keys before abcjs resolves accidentals for playback and MIDI grading. */
export function initialHymnSignatures(tune: TuneObject): () => void {
  type Staff = NonNullable<TuneObject["lines"][number]["staff"]>[number];
  const originals: [Staff, Staff["key"], Staff["clef"]][] = [];
  const previousClef = new Map<number, string>();
  const previous = new Map<number, string>();
  for (const line of tune.lines)
    line.staff?.forEach((staff, index) => {
      const key = staff.key, clef = staff.clef;
      originals.push([staff,key,clef]);
      const clefIdentity=JSON.stringify([clef?.type,clef?.verticalPos,clef?.clefPos]);
      if(clef && previousClef.get(index)===clefIdentity)staff.clef={...clef,type:"none"};
      previousClef.set(index,clefIdentity);
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
        staff.key = { ...key, accidentals: [] };
      }
      previous.set(index, signature);
    });
  return () => {
    for (const [staff, key, clef] of originals) {staff.key = key;staff.clef = clef;}
  };
}
