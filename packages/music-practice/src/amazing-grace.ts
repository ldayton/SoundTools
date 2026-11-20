import abcjs from "abcjs";
import type { BeginnerInstrument } from "./beginner-score";
import type { HymnLyricData } from "./hymn-lyrics";
import { accompanimentLyrics } from "./accompaniment-lyrics";
export const isAmazingGrace = (hymn: { id: string }) =>
  hymn.id === "amazing-grace";
type Chord = "G" | "C" | "D7" | "Em";
// A beginner reduction of the imported Excell setting. Preserve the changes
// to Em/C and the dominant sevenths; omit its inner passing notes and inversions.
export const graceChanges: { chord: Chord; beats: number; tie?: boolean }[][] =
  [
    [{ chord: "G", beats: 1 }],
    [{ chord: "G", beats: 3 }],
    [
      { chord: "G", beats: 2 },
      { chord: "D7", beats: 1 },
    ],
    [
      { chord: "Em", beats: 2 },
      { chord: "C", beats: 1 },
    ],
    [{ chord: "G", beats: 3 }],
    [{ chord: "G", beats: 3 }],
    [
      { chord: "G", beats: 2 },
      { chord: "D7", beats: 1 },
    ],
    [{ chord: "G", beats: 3, tie: true }],
    [
      { chord: "G", beats: 2 },
      { chord: "G", beats: 1 },
    ],
    [{ chord: "G", beats: 3 }],
    [{ chord: "G", beats: 3 }],
    [{ chord: "C", beats: 3 }],
    [{ chord: "G", beats: 3 }],
    [
      { chord: "Em", beats: 2 },
      { chord: "G", beats: 1 },
    ],
    [
      { chord: "G", beats: 2 },
      { chord: "D7", beats: 1 },
    ],
    [{ chord: "G", beats: 3, tie: true }],
    [{ chord: "G", beats: 2 }],
  ];
const piano: Record<Chord, string> = {
  G: "[G,,B,,D,]",
  C: "[C,E,G,]",
  Em: "[E,,G,,B,,]",
  D7: "[F,,A,,C,]",
};
const guitar: Record<Chord, string> = {
  G: "[G,B,DGBg]",
  C: "[CEGce]",
  Em: "[E,B,EGBe]",
  D7: "[DAcf]",
};
function accompaniment(instrument: "piano" | "guitar") {
  const voicings = instrument === "piano" ? piano : guitar;
  return graceChanges.map(
    (bar, index) =>
      bar
        .map((change, i) => {
          const continuation =
            i === 0 && index > 0 && graceChanges[index - 1].at(-1)?.tie;
          return `${instrument === "guitar" && !continuation ? `"${change.chord}"` : ""}${voicings[change.chord]}${change.beats * 16}${change.tie ? "-" : ""}`;
        })
        .join(" ") + (index === graceChanges.length - 1 ? " |]" : " |"),
  );
}
const header = (guitar = false) =>
  `X:1\nT:Amazing Grace\nM:3/4\nL:1/64\nQ:1/4=72\n${guitar ? "V:S1 clef=treble-8" : "%%score {S1 | S2}\nV:S1 clef=treble\nV:S2 clef=bass"}\nK:G\n`;
const groups = [
  [0],
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
];
export const graceGuitarAbc =
  header(true) +
  groups
    .map(
      (group) =>
        "[V:S1] " +
        group.map((i) => accompaniment("guitar")[i]).join(" ") +
        "\n",
    )
    .join("");
export function gracePianoAbc(melodyAbc: string) {
  const melody = melodyAbc.slice(melodyAbc.indexOf("K:G") + 3).trim();
  return (
    header() + `[V:S1] ${melody}\n[V:S2] ${accompaniment("piano").join(" ")}\n`
  );
}
export function graceChordOffset(bar: number) {
  return graceChanges.slice(0, bar).reduce((sum, b) => sum + b.length, 0);
}
export function graceLyricData(hymn: HymnLyricData & { harmony: string }) {
  let elapsed = 0;
  const starts = graceChanges.flatMap((bar) =>
    bar.map((change) => {
      const start = elapsed;
      elapsed += change.beats / 4;
      return start;
    }),
  );
  return accompanimentLyrics(hymn, starts);
}
export function graceGuitarPosition(
  pitch: number,
  chord: boolean,
  transpose = 0,
) {
  const positions: Record<number, [number, number]> = {
    42: [5, 2],
    62: [1, 3],
    40: [5, 0],
    43: [5, 3],
    47: [4, 2],
    48: [4, 3],
    50: [3, 0],
    52: [3, 2],
    55: [2, 0],
    57: [2, 2],
    59: [1, 0],
    60: [1, 1],
    64: [0, 0],
    66: [0, 2],
    67: [0, 3],
  };
  const position = positions[pitch - transpose];
  return position
    ? { str: position[0], num: position[1] + transpose }
    : undefined;
}
export function graceFingers(
  instrument: BeginnerInstrument,
  bar: number,
  voice: number,
  pitches: number[],
  force = false,
): (number | null)[] {
  if (instrument === "guitar") {
    if (voice === 1)
      return pitches.map((p) => ({ 42: 1, 43: 3, 47: 2, 48: 3 })[p] ?? null);
    return pitches.map((p) => ({ 52: 2, 57: 2, 62: 4 })[p] ?? null);
  }
  if (voice === 1) return pitches.map((_, i) => [5, 3, 1][i] ?? null);
  const high = bar >= 7 && bar <= 9;
  const fingers: Record<number, number> = high
    ? { 74: 5, 71: 3 }
    : { 62: 1, 64: 2, 67: 3, 69: 4, 71: 5 };
  return pitches.map((p) =>
    force || [0, 1, 2, 3, 7, 8, 10].includes(bar) ? (fingers[p] ?? null) : null,
  );
}
export function graceLandmarks(abc: string, from = 0, guitar = false) {
  if (!/^Q:/m.test(abc)) abc = abc.replace(/^K:/m, "Q:1/4=72\nK:");
  if (from === 0)
    abc = abc.replace(
      /^(\[V:\s*(?:S1|v0)\])\s*/m,
      `$1 [P:${guitar ? "No capo" : "Verse"}] `,
    );
  return (
    "%%barnumbers 1\n%%barnumberfont serif 10\n%%partsfont serif 12\n%%partsbox 1\n" +
    abc
  );
}

/** First-position fingerstyle: the source melody sounds one octave below Piano. */
export function graceFingerstyleAbc(melodyAbc: string, melodyOnly = false) {
  const tune = abcjs.parseOnly(melodyAbc)[0];
  const insertions: { at: number; text: string }[] = [];
  let bar = 0,
    beat = 0,
    hasNotes = false;
  for (const line of tune.lines)
    for (const note of line.staff?.[0]?.voices?.[0] || []) {
      if (note.el_type === "bar") {
        if (hasNotes) {
          bar++;
          beat = 0;
          hasNotes = false;
        }
        continue;
      }
      if (note.el_type !== "note") continue;
      let start = 0;
      for (const [index, change] of graceChanges[bar].entries()) {
        const continuation =
          index === 0 && bar > 0 && graceChanges[bar - 1].at(-1)?.tie;
        if (Math.abs(start - beat) < 1e-7 && !continuation)
          insertions.push({ at: note.startChar!, text: `"${change.chord}"` });
        start += change.beats / 4;
      }
      beat += note.duration;
      hasNotes = true;
    }
  let decorated = melodyAbc;
  for (const insertion of insertions.sort((a, b) => b.at - a.at))
    decorated =
      decorated.slice(0, insertion.at) +
      insertion.text +
      decorated.slice(insertion.at);
  const body = decorated.slice(decorated.indexOf("K:G") + 3).trim();
  // D7/F# omits the root: F# bass + C seventh support the melody's A.
  const voicing: Record<Chord, string> = {
    G: "[G,B,]",
    Em: "[E,B,]",
    C: "C",
    D7: "[F,C]",
  };
  const bass = graceChanges.map(
    (changes, index) =>
      changes
        .map(
          (change) =>
            voicing[change.chord] + change.beats * 16 + (change.tie ? "-" : ""),
        )
        .join(" ") + (index === 16 ? " |]" : " |"),
  );
  const melodyBars = [
    ...body.replace(/^w:.*$/gm, "").matchAll(/([^|]*)(\|\]?)/g),
  ].map((m) => m[1] + m[2]);
  return (
    `X:1\nT:Amazing Grace\nM:3/4\nL:1/64\nQ:1/4=72\n%%score ${melodyOnly ? "S1" : "(S1 S2)"}\nV:S1 clef=treble-8 stem=up\n${melodyOnly ? "" : "V:S2 clef=treble-8 stem=down\n"}K:G\n` +
    groups
      .map(
        (group) =>
          `[V:S1] ${group.map((i) => melodyBars[i]).join(" ")}\n` +
          (melodyOnly ? "" : `[V:S2] ${group.map((i) => bass[i]).join(" ")}\n`),
      )
      .join("")
  );
}
