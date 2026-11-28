import type {
  GuitarPhraseNote,
  GuitarFingeringProfile,
} from "../src/guitar-phrase-fingering";
import { referenceFrames } from "./guitar-fingering-oracle";
export function generatedGuitarPhrase(seed: number) {
  let state = seed >>> 0;
  const integer = (n: number) => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return Math.floor((((z ^ (z >>> 15)) >>> 0) / 0x100000000) * n);
  };
  const position = 1 + integer(16),
    barre = !!integer(2);
  const profile: GuitarFingeringProfile = {
    capo: integer(5),
    bpm: 40 + integer(201),
    maxFingers: 3 + integer(2),
    allowBarres: barre || !!integer(2),
  };
  const notes: GuitarPhraseNote[] = [],
    fingers: Record<string, number> = Object.create(null);
  const add = (
    id: string,
    start: number,
    duration: number,
    string: number,
    fret: number,
    finger: number,
    tieFrom?: string,
  ) => {
    notes.push({
      id,
      start,
      duration,
      string,
      fret,
      ...(tieFrom ? { tieFrom } : {}),
    });
    fingers[id] = finger;
  };
  const held = barre ? [4, 2] : [6];
  for (const [i, string] of held.entries()) {
    const id =
      i === 0 && seed % 8 === 0
        ? ["__proto__", "constructor", "toString"][(seed / 8) % 3]
        : `hold-${i}`;
    if (integer(2)) {
      add(id, 0, 1, string, position, 1);
      add(id + "-tie", 1, 2, string, position, 1, id);
    } else add(id, 0, 3, string, position, 1);
  }
  for (let beat = 0; beat < 3; beat++) {
    const finger = 3 + integer(2),
      duration = integer(2) ? 1 : 0.5;
    add(`melody-${beat}`, beat, duration, 1, position + finger - 1, finger);
    if (!barre && integer(2))
      add(`chord-${beat}`, beat, duration, 2, position + 1, 2);
  }
  add("open-after-rest", 5, 0.5, 3, 0, 0);
  return { seed, notes, profile, witness: { position, fingers } };
}
/** Remove whole tied-contact groups, preserving a known-playable subset.
 * Diagnostic shrinking never converts a failing assertion into a passing test. */
export function minimizeGuitarFailure(
  notes: readonly GuitarPhraseNote[],
  fails: (notes: GuitarPhraseNote[]) => boolean,
) {
  let result = [...notes],
    changed = true;
  while (changed) {
    changed = false;
    const { roots } = referenceFrames(result);
    for (const root of new Set(roots.values())) {
      const trial = result.filter((n) => roots.get(n.id) !== root);
      if (fails(trial)) {
        result = trial;
        changed = true;
        break;
      }
    }
  }
  return result;
}
