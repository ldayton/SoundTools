import {capoAudio} from "./edition-score";
import { accompanimentLyrics } from "./accompaniment-lyrics";
import abcjs from "abcjs";
import type { HymnLyricData } from "./hymn-lyrics";
import type { BeginnerInstrument } from "./beginner-score";

// Capo-relative C/F/G/Am accompaniment from scores/in-christ-alone-music.ily
// in ldayton/tab-music. Written pitches use the conventional guitar octave clef.
const chords = {
  C: "[CEGce]",
  F: "[FAcf]",
  G: "[G,B,DGBg]",
  Am: "[A,EAce]",
};
const bars: [keyof typeof chords, number][][] = [
  [["F", 3]],
  [
    ["C", 4],
    ["F", 2],
  ],
  [
    ["G", 4],
    ["C", 2],
  ],
  [
    ["F", 2],
    ["G", 4],
  ],
  [
    ["C", 4],
    ["F", 2],
  ],
  [
    ["C", 4],
    ["F", 2],
  ],
  [
    ["G", 4],
    ["C", 2],
  ],
  [
    ["F", 2],
    ["G", 4],
  ],
  [
    ["C", 4],
    ["C", 2],
  ],
  [
    ["F", 4],
    ["C", 2],
  ],
  [
    ["G", 4],
    ["C", 2],
  ],
  [
    ["F", 4],
    ["C", 2],
  ],
  [
    ["G", 4],
    ["F", 2],
  ],
  [
    ["C", 4],
    ["F", 2],
  ],
  [
    ["G", 4],
    ["C", 2],
  ],
  [
    ["F", 2],
    ["G", 4],
  ],
  [["C", 6]],
  [["C", 6]],
  [["F", 6]],
  [["Am", 6]],
  [["C", 6]],
];
export const christGuitarAbc =
  "X:1\nT:In Christ Alone\nM:3/4\nL:1/8\nQ:1/4=70\nV:S1 clef=treble-8\nK:C\n" +
  [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ]
    .map(
      (group) =>
        `[V:S1] ${group.map((index) => bars[index].map(([chord, duration]) => `"${chord}"${chords[chord]}${duration}`).join(" ") + ` ${index === 20 ? "|]" : "|"}`).join(" ")}\n`,
    )
    .join("");

/** Printed fingering/tablature positions are relative to capo 2. */
export function christGuitarPosition(
  pitch: number,
  chord: boolean,
  transpose = 0,
) {
  const p = pitch - transpose;
  const position: Record<number, [number, number]> = {
    72: [0, 8],
    71: [0, 7],
    69: [0, 5],
    62: [1, 3],
    43: [5, 3],
    47: [4, 2],
    50: [3, 0],
    55: [2, 0],
    59: [1, 0],
    67: [0, 3],
    48: [4, 3],
    52: [3, 2],
    60: [1, 1],
    64: [0, 0],
    53: [3, 3],
    57: [2, 2],
    65: [0, 1],
    45: [4, 0],
  };
  const entry = position[p];
  return entry ? { str: entry[0], num: entry[1] + transpose } : undefined;
}
export function christFingers(
  instrument: BeginnerInstrument,
  bar: number,
  voice: number,
  pitches: number[],
  force = false,
): (number | null)[] {
  if (instrument === "guitar") {
    return pitches.map((sounding) => {
      const pitch = sounding - 2;
      if (voice === 1)
        return (
          { 43: 2, 48: 3, 52: 2, 53: bar === 9 || bar === 11 ? 1 : 3 }[pitch] ??
          null
        );
      return (
        {
          57: 2,
          60: 1,
          62: [2, 6, 14].includes(bar) ? 4 : 3,
          67: 4,
          69: 3,
          71: 1,
          72: 2,
        }[pitch] ?? null
      );
    });
  }
  if (voice === 1) return pitches.map((_, i) => [5, 3, 1][i] ?? null);
  const fingers: Record<number, number> =
    bar < 8 || (bar >= 12 && bar < 17)
      ? { 57: 1, 59: 2, 62: 3, 64: 4, 66: 5 }
      : bar === 8
        ? { 62: 1, 66: 2, 69: 4 }
        : bar === 9
          ? { 71: 5, 69: 4, 66: 2 }
          : bar === 10
            ? { 64: 2, 62: 1, 74: 5, 73: 4 }
            : bar === 11
              ? { 71: 3, 69: 2, 66: 1 }
              : { 62: 1, 66: 3 };
  // Repeated figures need no second set of annotations.
  const show = force || [0, 2, 8, 9, 10, 11, 12, 17, 19].includes(bar);
  return pitches.map((p) => (show ? (fingers[p] ?? null) : null));
}
export function christLandmarks(abc: string, from = 0, guitar = false) {
  if (!/^Q:/m.test(abc)) abc = abc.replace(/^K:/m, "Q:1/4=70\nK:");
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
            const label =
              bar === 0
                ? guitar
                  ? "Capo 2"
                  : "Verse"
                : bar === 17
                  ? "Ending"
                  : undefined;
            bar++;
            return `${delimiter} ${label ? `[P:${label}] ` : ""}${music}`;
          },
        );
      })
      .join("\n")
  );
}

export function christGuitarChordOffset(bar: number) {
  return bars.slice(0, bar).reduce((sum, bar) => sum + bar.length, 0);
}

/** Align every selected verse to chord changes using the melody's actual rhythm. */
export function christGuitarLyricData(
  hymn: HymnLyricData & { harmony: string },
): HymnLyricData {
  let elapsed = 0;
  const changes = bars.flatMap((bar) =>
    bar.map(([, duration]) => {
      const start = elapsed;
      elapsed += duration / 8;
      return start;
    }),
  );
  return accompanimentLyrics(hymn, changes, christGuitarChordOffset(17));
}

/** abcjs octave-clef voices override its global MIDI transpose; apply the capo explicitly. */
export function christCapoAudio(
  audio: import("abcjs").AudioTracks,
): import("abcjs").AudioTracks {
  return capoAudio(audio,2);
}

/** A light two-voice fingerstyle setting; pitches and frets are capo-relative. */
export function christFingerstyleAbc(
  hymn: { harmony: string },
  melodyOnly = false,
) {
  const transposed = abcjs.strTranspose(
    hymn.harmony,
    abcjs.parseOnly(hymn.harmony),
    -2,
  );
  const tune = abcjs.parseOnly(transposed)[0];
  const melodyBars: Extract<
    import("abcjs").VoiceItem,
    { el_type: "note" }
  >[][] = [];
  let current: Extract<import("abcjs").VoiceItem, { el_type: "note" }>[] = [];
  for (const line of tune.lines)
    for (const item of line.staff?.[0]?.voices?.[0] || []) {
      if (item.el_type === "note") current.push(item);
      if (item.el_type === "bar" && current.length) {
        melodyBars.push(current);
        current = [];
      }
    }
  if (current.length) melodyBars.push(current);
  const bass = { C: "[CE]", F: "F", G: "[G,D]", Am: "[A,E]" };
  const rows = [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ];
  const header = `X:1\nT:In Christ Alone\nM:3/4\nL:1/64\nQ:1/4=70\n%%score ${melodyOnly ? "S1" : "(S1 S2)"}\nV:S1 clef=treble-8 stem=up\n${melodyOnly ? "" : "V:S2 clef=treble-8 stem=down\n"}K:C\n`;
  const melody = melodyBars.map((notes, bar) => {
    let elapsed = 0;
    const changes = bars[bar].map(([chord, duration]) => {
      const start = elapsed;
      elapsed += duration / 8;
      return { chord, start };
    });
    let time = 0;
    return (
      notes
        .map((note) => {
          const symbol = changes.find((c) => Math.abs(c.start - time) < 1e-7);
          const pitch = note.pitches![0].name.match(
            /^[\^_=]*[A-Ga-g][',]*/,
          )![0];
          const shift =
            bar === 10 && time === 0.5
              ? '"^VII"'
              : (bar === 9 || bar === 11) && time === 0
                ? '"^III"'
                : (bar === 9 || bar === 11) && time === 0.5
                  ? '"^I"'
                  : "";
          const start = time;
          time += note.duration;
          return {
            music: `${symbol ? `"${symbol.chord}"` : ""}${shift}${pitch}${Math.round(note.duration * 64)}`,
            start,
            duration: note.duration,
          };
        })
        .reduce((text, n, i, all) => {
          const previous = all[i - 1],
            offset = bar === 0 ? 1.5 : 0;
          const beam =
            previous &&
            previous.duration < 0.25 &&
            n.duration < 0.25 &&
            Math.floor(previous.start * 4 + offset + 1e-7) ===
              Math.floor(n.start * 4 + offset + 1e-7);
          return text + (i && !beam ? " " : "") + n.music;
        }, "") + (bar === 20 ? " |]" : " |")
    );
  });
  return (
    header +
    rows
      .map(
        (row) =>
          `[V:S1] ${row.map((i) => melody[i]).join(" ")}\n` +
          (melodyOnly
            ? ""
            : `[V:S2] ${row.map((i) => bars[i].map(([chord, duration], change) => `${i === 10 && change === 1 ? "z" : bass[chord]}${duration * 8}`).join(" ") + (i === 20 ? " |]" : " |")).join(" ")}\n`),
      )
      .join("")
  );
}

/** Preserve the reviewed lower piano register and source two-hand setting. */
export function christPianoAbc(source:string){return abcjs.strTranspose(source,abcjs.parseOnly(source),-12)
 .replace('%%staves S1 | S2','%%score {S1 | S2}').replace('L:1/64','L:1/64\nQ:1/4=70');}
