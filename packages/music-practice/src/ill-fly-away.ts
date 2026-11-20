import abcjs from "abcjs";
import type { BeginnerInstrument } from "./beginner-score";
import type { HymnLyricData } from "./hymn-lyrics";
import { accompanimentLyrics } from "./accompaniment-lyrics";
export const isFlyAway = (hymn: { id: string }) => hymn.id === "ill-fly-away";
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
/** Beam short notes within each quarter-note beat without changing the source tokens. */
function beamByBeat(abc: string) {
  const tune = abcjs.parseOnly(abc)[0],
    cuts: { from: number; to: number }[] = [];
  let beat = 0,
    previous:
      { start: number; duration: number; from: number; to: number } | undefined;
  for (const line of tune.lines)
    for (const item of line.staff?.[0]?.voices?.[0] || []) {
      if (item.el_type === "bar") {
        beat = 0;
        previous = undefined;
        continue;
      }
      if (item.el_type !== "note") continue;
      const start = beat,
        duration = item.duration * 4;
      beat += duration;
      if (!item.pitches?.length) {
        previous = undefined;
        continue;
      }
      if (
        previous &&
        previous.duration < 1 &&
        duration < 1 &&
        Math.floor(previous.start + 1e-7) === Math.floor(start + 1e-7)
      ) {
        const tail = abc.slice(previous.from, previous.to).match(/\s*$/)![0]
            .length,
          head = abc.slice(item.startChar!, item.endChar!).match(/^\s*/)![0]
            .length;
        const from = previous.to - tail,
          to = item.startChar! + head;
        if (to > from && !abc.slice(from, to).trim()) cuts.push({ from, to });
      }
      previous = { start, duration, from: item.startChar!, to: item.endChar! };
    }
  for (const { from, to } of cuts.sort((a, b) => b.from - a.from))
    abc = abc.slice(0, from) + abc.slice(to);
  return abc;
}
export function flyEditionAbc(
  sourceMelody: string,
  instrument: BeginnerInstrument,
  part: "right" | "left" | "both" = "both",
) {
  const piano = instrument === "piano",
    chordsOnly = !piano && part === "left";
  let melody = piano
    ? abcjs.strTranspose(sourceMelody, abcjs.parseOnly(sourceMelody), -12)
    : sourceMelody;
  melody = beamByBeat(melody);
  const tune = abcjs.parseOnly(melody)[0],
    insertions: { at: number; text: string }[] = [];
  let bar = 0,
    elapsed = 0,
    notes = false;
  for (const line of tune.lines)
    for (const note of line.staff?.[0]?.voices?.[0] || []) {
      if (note.el_type === "bar") {
        if (notes) {
          bar++;
          elapsed = 0;
          notes = false;
        }
        continue;
      }
      if (note.el_type !== "note") continue;
      const change = flyChanges[bar].find(
        ([at]) => Math.abs(at - elapsed) < 1e-7,
      );
      if (change && !piano)
        insertions.push({ at: note.startChar!, text: `"${change[1]}"` });
      elapsed += note.duration * 64;
      notes = true;
    }
  for (const { at, text } of insertions.sort((a, b) => b.at - a.at))
    melody = melody.slice(0, at) + text + melody.slice(at);
  const body = melody
    .slice(melody.indexOf("K:C") + 3)
    .replace(/^w:.*$/gm, "")
    .trim();
  const melodyBars = [...body.matchAll(/([^|]*)(\|\]?)/g)].map(
    (m) => m[1] + m[2],
  );
  const accompaniment = flyChanges.map(
    (changes, bar) =>
      changes
        .map(
          ([start, chord], i) =>
            `${chordsOnly ? `"${chord}"` : ""}${(chordsOnly ? strum : piano ? pianoBass : bar === 12 ? { ...guitarBass, C: "C" } : guitarBass)[chord]}${(changes[i + 1]?.[0] ?? 64) - start}`,
        )
        .join(" ") + (bar === 15 ? " |]" : " |"),
  );
  const voice = chordsOnly
    ? "S2"
    : part === "right"
      ? "S1"
      : part === "left"
        ? "S2"
        : piano
          ? "{S1 | S2}"
          : "(S1 S2)";
  const header = `X:1\nT:I'll Fly Away\nM:4/4\nL:1/64\nQ:1/4=80\n%%score ${voice}\n${part !== "left" ? "V:S1 clef=" + (piano ? "treble" : "treble-8 stem=up") + "\n" : ""}${part !== "right" ? "V:S2 clef=" + (piano ? "bass" : "treble-8 stem=down") + "\n" : ""}K:C\n`;
  return (
    header +
    groups
      .map(
        (group) =>
          (part !== "left"
            ? `[V:S1] ${group.map((i) => melodyBars[i]).join(" ")}\n`
            : "") +
          (part !== "right"
            ? `[V:S2] ${group.map((i) => accompaniment[i]).join(" ")}\n`
            : ""),
      )
      .join("")
  );
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
