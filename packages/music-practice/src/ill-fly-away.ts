import { instrumentHymnAbc, type InstrumentHymn } from "./instrument-hymn";
import type { BeginnerInstrument } from "./beginner-score";
import type { HymnLyricData } from "./hymn-lyrics";
import { accompanimentLyrics } from "./accompaniment-lyrics";
// Existing lesson-aligned harmony: V7 arrives on “fly”, not at the first endings.
export const flyChanges: [number, string][][] = [
  [[0, "C"]],
  [[0, "C"]],
  [[0, "F"]],
  [[0, "C"]],
  [[0, "C"]],
  [[0, "C"]],
  [
    [0, "C"],
    [48, "G7"],
  ],
  [[0, "C"]],
  [[0, "C"]],
  [[0, "C"]],
  [[0, "F"]],
  [[0, "C"]],
  [[0, "C"]],
  [[0, "C"]],
  [
    [0, "C"],
    [48, "G7"],
  ],
  [[0, "C"]],
];

const guitarBass: Record<string, string> = { C: "[CE]", F: "F", G7: "[B,F]" };
const pianoBass: Record<string, string> = {
  C: "[C,E,]",
  F: "[F,,A,,C,]",
  G7: "[B,,D,F,]",
};
const strum: Record<string, string> = {
  C: "[CEGce]",
  F: "[FAcf]",
  G7: "[G,B,DGBf]",
};
const groups = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
];
export const flyEdition: InstrumentHymn = {
  title: "I'll Fly Away",
  key: "C",
  guitarKey: "C",
  guitarTranspose: 0,
  pianoTranspose: -12,
  tempo: 80,
  meter: "4/4",
  changes: flyChanges,
  piano: pianoBass,
  guitar: guitarBass,
  strum,
  groups,
  guitarBars: { 12: [["C", 64]] },
  marks: [],
};
/** Singing accompaniment: keep the instrumental lesson harmony independent. */
export const flyVocalChanges: [number, string][][] = [
  [[0,"C"]], [[0,"Am"]], [[0,"F"]], [[0,"G7"],[32,"C"]],
  [[0,"C"]], [[0,"Am"]], [[0,"C"],[48,"G7"]], [[0,"C"],[48,"G7"]],
  [[0,"C"],[48,"Am"]], [[0,"C"]], [[0,"F"]], [[0,"G7"],[32,"C"]],
  [[0,"C"]], [[0,"C"]], [[0,"C"],[48,"G7"]], [[0,"C"]],
];
export function flyVocalAccompanimentAbc(melody: string) {
  return instrumentHymnAbc(melody, {
    ...flyEdition, changes: flyVocalChanges,
    strum: {...strum, Am: "[A,EAce]"},
  }, "guitar", "left");
}
export function flyEditionAbc(
  sourceMelody: string,
  instrument: BeginnerInstrument,
  part: "right" | "left" | "both" = "both",
) {
  return instrumentHymnAbc(sourceMelody, flyEdition, instrument, part);
}
export function flyChordOffset(bar: number) {
  return flyChanges.slice(0, bar).reduce((sum, c) => sum + c.length, 0);
}
export function flyLyricData(hymn: HymnLyricData & { harmony: string }) {
  const starts = flyChanges.flatMap((c, bar) => c.map(([at]) => bar + at / 64));
  return accompanimentLyrics(hymn, starts);
}
export function flyGuitarPosition(
  pitch: number,
  chord: boolean,
  transpose = 0,
) {
  const position: Record<number, [number, number]> = {
    47: [4, 2],
    48: [4, 3],
    52: [3, 2],
    53: [3, 3],
    55: [2, 0],
    57: [2, 2],
    59: [1, 0],
    60: [1, 1],
    62: [1, 3],
    63: [1, 4],
    64: [0, 0],
    65: [0, 1],
    67: [0, 3],
    43: [5, 3],
    50: [3, 0],
  };
  const p = position[pitch - transpose];
  return p ? { str: p[0], num: p[1] + transpose } : undefined;
}
export function flyFingers(
  instrument: BeginnerInstrument,
  bar: number,
  voice: number,
  pitches: number[],
  force = false,
): (number | null)[] {
  if (instrument === "guitar")
    return pitches.map((p) =>
      voice === 1
        ? ({ 47: 2, 48: 3, 52: 2, 53: 3 }[p] ?? null)
        : ({ 57: 2, 60: 1, 62: 4, 63: 4, 65: 1, 67: 4 }[p] ?? null),
    );
  if (voice === 1)
    return pitches.map(
      (_, i) => (pitches.length === 2 ? [5, 1] : [5, 3, 1])[i] ?? null,
    );
  const pattern: Record<number, number | undefined> =
    bar === 0 || bar === 4 || bar === 12
      ? { 55: 1, 57: 2, 60: 3, 64: 5 }
      : bar === 2 || bar === 10
        ? { 57: 1, 60: 3 }
        : bar === 3 || bar === 11
          ? { 55: 1 }
          : { 60: 1, 62: 2, 63: 2, 64: 3, 65: 4, 67: 5 };
  return pitches.map((p) =>
    force || [0, 1, 2, 3, 8, 9, 10, 12, 13, 15].includes(bar)
      ? (pattern[p] ?? null)
      : null,
  );
}
export function flyLandmarks(abc: string, from = 0) {
  let bar = from;
  return (
    "%%barnumbers 1\n%%barnumberfont serif 10\n%%partsfont serif 12\n%%partsbox 1\n" +
    abc
      .split("\n")
      .map((line) => {
        if (!/^\[V:(?:S1|v0)\]/.test(line)) return line;
        return line.replace(
          /(\[V:[^\]]+\]|\|\]?)\s*([^|]*)/g,
          (all, delimiter: string, music: string) => {
            if (!music.trim()) return all;
            const part = bar === 0 ? "Verse" : bar === 8 ? "Chorus" : undefined;
            bar++;
            return delimiter + " " + (part ? `[P:${part}] ` : "") + music;
          },
        );
      })
      .join("\n")
  );
}
