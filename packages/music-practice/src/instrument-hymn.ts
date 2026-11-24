import abcjs from "abcjs";
import { beamByBeat } from "./score-melody";
export type HymnChange = [number, string];
export type InstrumentHymn = {
  title: string;
  key: string;
  guitarKey: string;
  guitarTranspose: number;
  pianoTranspose?: number;
  tempo: number;
  meter: string;
  capo?: number;
  changes: HymnChange[][];
  piano: Record<string, string>;
  guitar: Record<string, string>;
  strum: Record<string, string>;
  guitarBars?: Record<number, [string, number][]>;
  groups: number[][];
  barLengths?: number[];
  /** Closing rest in 1/64 units, shared by every accompaniment version. */
  endingRest?: number;
  marks: { bar: number; at?: number; label: string }[];
};
/** Preserve the supplied melody's tokens while engraving instrument-specific accompaniment. */
export function instrumentHymnAbc(
  source: string,
  config: InstrumentHymn,
  instrument: "piano" | "guitar",
  part: "right" | "left" | "both" = "both",
) {
  const piano = instrument === "piano",
    strumming = !piano && part === "left",
    key = piano ? config.key : config.guitarKey;
  const transpose = piano ? config.pianoTranspose || 0 : config.guitarTranspose;
  let melody = transpose
    ? abcjs.strTranspose(source, abcjs.parseOnly(source), transpose)
    : source;
  melody = beamByBeat(melody);
  const edits: { at: number; text: string }[] = [];
  const melodyOnsets = new Set<string>();
  let bar = 0,
    time = 0,
    seen = false;
  for (const line of abcjs.parseOnly(melody)[0].lines)
    for (const n of line.staff?.[0]?.voices?.[0] || []) {
      if (n.el_type === "bar") {
        if (seen) {
          bar++;
          time = 0;
          seen = false;
        }
        continue;
      }
      if (n.el_type !== "note") continue;
      melodyOnsets.add(`${bar}:${time}`);
      const chord = config.changes[bar].find(
        ([at]) => Math.abs(at - time) < 1e-7,
      )?.[1];
      const mark = config.marks.find(
        (m) => m.bar === bar && Math.abs((m.at || 0) - time) < 1e-7,
      );
      if ((chord && !piano) || mark)
        edits.push({
          at: n.startChar!,
          text:
            (mark ? `[P:${mark.label}] ` : "") +
            (chord && !piano ? `"${chord}"` : ""),
        });
      time += n.duration * 64;
      seen = true;
    }
  for (const e of edits.sort((a, b) => b.at - a.at))
    melody = melody.slice(0, e.at) + e.text + melody.slice(e.at);
  const match = melody.match(/^K:.*\n/m)!;
  const body = melody
    .slice(match.index! + match[0].length)
    .replace(/^w:.*$/gm, "")
    .trim();
  const notes = [...body.matchAll(/([^|]*)(\|\]?)/g)].map((m) => m[1] + m[2]);
  const bass = config.changes.map((changes, bar) => {
    const segments = !piano && !strumming && config.guitarBars?.[bar];
    const rest = bar === config.changes.length - 1 ? config.endingRest || 0 : 0;
    return (
      (segments
        ? segments.map(([token, length]) => token + length).join(" ")
        : changes
            .map(([at, chord], i) => {
              const length =
                (changes[i + 1]?.[0] ?? (config.barLengths?.[bar] ?? 64) - rest) - at;
              return `${!piano && (strumming || !melodyOnsets.has(`${bar}:${at}`)) ? `"${chord}"` : ""}${(strumming ? config.strum : piano ? config.piano : config.guitar)[chord]}${length}`;
            })
            .join(" ")) + (rest ? ` z${rest}` : "") + (bar === config.changes.length - 1 ? " |]" : " |")
    );
  });
  const grouping =
    part === "right"
      ? "S1"
      : part === "left"
        ? "S2"
        : piano
          ? "{S1 | S2}"
          : "(S1 S2)";
  const header = `%%barnumbers 1\n%%barnumberfont serif 10\n%%partsfont serif 12\n%%partsbox 1\nX:1\nT:${config.title}\nM:${config.meter}\nL:1/64\nQ:${!piano && config.capo ? `"Capo ${config.capo}" ` : ""}1/4=${config.tempo}\n%%score ${grouping}\n${part !== "left" ? `V:S1 clef=${piano ? "treble" : "treble-8 stem=up"}\n` : ""}${part !== "right" ? `V:S2 clef=${piano ? "bass" : "treble-8 stem=down"}\n` : ""}K:${key}\n`;
  return (
    header +
    config.groups
      .map(
        (group) =>
          (part !== "left"
            ? `[V:S1] ${group.map((i) => notes[i]).join(" ")}\n`
            : "") +
          (part !== "right"
            ? `[V:S2] ${group.map((i) => bass[i]).join(" ")}\n`
            : ""),
      )
      .join("")
  );
}
