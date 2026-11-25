import type { TuneObject } from "abcjs";

/** Omit unchanged system headers during engraving, then restore the musical
 * keys before abcjs resolves accidentals for playback and MIDI grading. */
export function initialHymnSignatures(tune: TuneObject): () => void {
  type Staff = NonNullable<TuneObject["lines"][number]["staff"]>[number];
  const keyIdentity=(key:Staff["key"])=>JSON.stringify([key?.root,key?.acc,key?.mode,
    (key?.accidentals||[]).filter(({acc})=>acc!=="natural").map(({acc,note})=>[acc,note])]);
  const clefIdentity=(clef:Staff["clef"])=>JSON.stringify([clef?.type,clef?.verticalPos,clef?.clefPos]);
  const originals: [Staff, Staff["key"], Staff["clef"]][] = [];
  const previousClef = new Map<number, string>();
  const previous = new Map<number, string>();
  for (const line of tune.lines)
    line.staff?.forEach((staff, index) => {
      const key = staff.key, clef = staff.clef;
      originals.push([staff,key,clef]);
      const identity=clefIdentity(clef);
      if(clef && previousClef.get(index)===identity)staff.clef={...clef,type:"none"};
      previousClef.set(index,identity);
      if(key) {
        const signature=keyIdentity(key);
        if(previous.get(index)===signature)staff.key={...key,accidentals:[]};
        previous.set(index,signature);
      }
      // A signature printed inside the previous system is already in force
      // at the next opening. Track it instead of repeating the change there.
      for(const voice of staff.voices||[]) {
        // A boundary K: directive may be attached after the previous line's
        // final note. It still belongs at the next opening. Only a change
        // followed by music in this system has already been printed inline.
        const lastNote=voice.findLastIndex(item=>item.el_type==="note");
        for(let i=0;i<lastNote;i++) {
          const item=voice[i];
          if(item.el_type==="key")previous.set(index,keyIdentity(item));
          if(item.el_type==="clef")previousClef.set(index,clefIdentity(item));
        }
      }
    });
  return () => {
    for (const [staff, key, clef] of originals) {staff.key = key;staff.clef = clef;}
  };
}
