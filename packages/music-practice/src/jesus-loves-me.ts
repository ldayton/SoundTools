import { instrumentHymnAbc, type InstrumentHymn } from "./instrument-hymn";
import type { BeginnerInstrument } from "./beginner-score";
export const jesusEdition: InstrumentHymn = {
  title: "Jesus Loves Me",
  key: "Eb",
  guitarKey: "C",
  guitarTranspose: -3,
  tempo: 72,
  meter: "4/4",
  capo: 3,
  changes: [
    [
      [0, "C"],
      [48, "G7"],
    ],
    [[0, "C"]],
    [[0, "F"]],
    [
      [0, "F"],
      [16, "C"],
    ],
    [
      [0, "C"],
      [48, "G7"],
    ],
    [[0, "C"]],
    [
      [0, "F"],
      [32, "C"],
    ],
    [
      [0, "C"],
      [16, "G7"],
      [32, "C"],
    ],
    [[0, "C"]],
    [[0, "F"]],
    [[0, "C"]],
    [
      [0, "C"],
      [16, "G7"],
    ],
    [[0, "C"]],
    [[0, "F"]],
    [
      [0, "C"],
      [56, "G7"],
    ],
    [[0, "C"]],
  ],
  // Piano retains E-flat; C-family symbols below are relative to capo 3 on Guitar.
  piano: { C: "[E,G,B,]", F: "[A,,C,E,]", G7: "[D,F,A,]" },
  guitar: { C: "C", F: "F", G7: "[F,B,]" },
  strum: { C: "[CEGce]", F: "[FAcf]", G7: "[G,B,DGBf]" },
  guitarBars: {
    6: [
      ["F", 32],
      ["C", 16],
      ["G,", 16],
    ],
    7: [
      ["C", 16],
      ["[F,B,]", 16],
      ["G,", 32],
    ],
    10: [
      ["C", 48],
      ["G,", 16],
    ],
    14: [
      ["C", 16],
      ["G,", 16],
      ["C", 24],
      ["[F,B,]", 8],
    ],
    15: [["G,", 64]],
  },
  groups: [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9, 10, 11],
    [12, 13, 14, 15],
  ],
  marks: [
    { bar: 0, label: "Verse" },
    { bar: 8, label: "Refrain" },
  ],
};
/** Raised melody over an invariant root/fifth thumb pulse. No fills or syncopated bass. */
export const jesusGuitarEdition: InstrumentHymn = {
  ...jesusEdition, guitarKey: "G", guitarTranspose: 4, capo: 8, tempo: 80,
  changes: jesusEdition.changes.map(bar => bar.map(([at, chord]) => [at, ({C:"G",F:"C",G7:"D7"} as Record<string,string>)[chord]])),
  // Keep the separate singing accompaniment at its original concert pitches.
  strum: {G:"[G,B,DGB]",C:"[CEGc]",D7:"[D,^F,A,D^Fc]"},
  guitarBars: Object.fromEntries(jesusEdition.changes.map((changes, bar) => [bar,
    [0,1,2,3].map(beat => {
      const chord=[...changes].reverse().find(([at]) => at<=beat*16)![1];
      return [({C:["G,","D"],F:["C","G,"],G7:["D","A,"]} as Record<string,string[]>)[chord][beat%2],16];
    })])),
};
export function jesusInstrumentAbc(source: string, instrument: BeginnerInstrument, part: "right" | "left" | "both" = "both") {
  const abc=instrumentHymnAbc(source,instrument === "guitar" ? jesusGuitarEdition : jesusEdition,instrument,part);
  return instrument === "guitar" ? abc.replace(/^(\[V:S2\])/gm,"$1 !p! ") : abc;
}
export function jesusPosition(pitch: number, chord: boolean, transpose = 0) {
  const positions: Record<number, [number, number]> = {
    43:[5,3],45:[4,0],48:[4,3],50:[3,0],55:[2,0],57:[2,2],
    59:[1,0],60:[1,1],62:[1,3],64:[0,0],67:[0,3],
  };
  const p=positions[pitch-transpose];
  return p ? {str:p[0],num:p[1]+transpose} : undefined;
}
export function jesusFingers(
  instrument: BeginnerInstrument,
  bar: number,
  voice: number,
  pitches: number[],
  force = false,
): (number | null)[] {
  if (instrument === "guitar")
    return pitches.map(actual => ({ 43: 3, 48: 3, 57: 1, 60: 1, 62: 4, 67: 4 } as Record<number, number>)[actual - 8] ?? null);
  if (voice === 1) return pitches.map((_, i) => [5, 3, 1][i] ?? null);
  const high = [2, 3, 9, 13].includes(bar),
    f: Record<number, number> = high
      ? { 70: 2, 72: 3, 75: 5 }
      : { 63: 1, 65: 2, 67: 3, 70: 4, 72: 5 };
  return pitches.map((p) =>
    force || [0, 2, 3, 4, 6, 8, 9, 10, 13, 14, 15].includes(bar)
      ? (f[p] ?? null)
      : null,
  );
}
