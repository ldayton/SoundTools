import abcjs, { type VoiceItem } from "abcjs";
import { beamByBeat } from "./score-melody";
import { accompanimentLyrics } from "./accompaniment-lyrics";
import { christFingers, christGuitarPosition } from "./in-christ-alone-fingering";
import type { HymnLyricData } from "./hymn-lyrics";
import type { BeginnerInstrument } from "./beginner-score";
type Note = Extract<VoiceItem, { el_type: "note" }>;
type Event = { note: Note; at: number; length: number };
type Change = { at: number; chord: string };
const lengths = [24, ...Array(19).fill(48), 24];
const shapes: Record<string, string> = {
  D: "C",
  G: "F",
  A: "G",
  "D/F#": "C/E",
  Bm: "Am",
  Em: "Dm",
  A7: "G7",
  "D/A": "C/G",
};
const piano: Record<string, string> = {
  D: "[D,,F,,A,,]",
  G: "[G,,B,,D,]",
  A: "[A,,C,E,]",
  "D/F#": "[F,,A,,D,]",
  Bm: "[B,,D,F,]",
  Em: "[E,,G,,B,,]",
  A7: "[C,E,G,]",
  "D/A": "[A,,D,F,]",
};
const bass: Record<string, string> = {
  D: "[CE]",
  G: "F",
  A: "[G,D]",
  "D/F#": "E,",
  Bm: "[A,E]",
  Em: "D",
  A7: "[G,D]",
  "D/A": "G,",
};
const strum: Record<string, string> = {
  D: "[CEGce]",
  G: "[FAcf]",
  A: "[G,B,DGBg]",
  "D/F#": "[E,CEGce]",
  Bm: "[A,EAce]",
  Em: "[DAdf]",
  A7: "[G,B,DGBf]",
  "D/A": "[G,CEGc]",
};
function voices(source: string) {
  const tune = abcjs.parseOnly(source)[0];
  const all: Event[][][] = Array.from({ length: 5 }, () => []);
  for (const line of tune.lines)
    for (const [staffIndex, staff] of (line.staff || []).entries())
      for (const [voiceIndex, voice] of (staff.voices || []).entries()) {
        const index =
          staffIndex === 0 ? 0 : staffIndex === 1 ? 1 + voiceIndex : 4;
        let at = 0;
        let notes: Event[] = [];
        for (const note of voice) {
          if (note.el_type === "note") {
            const length = Math.round(note.duration * 64);
            notes.push({ note, at, length });
            at += length;
          }
          if (note.el_type === "bar" && notes.length) {
            all[index].push(notes);
            notes = [];
            at = 0;
          }
        }
        if (notes.length) all[index].push(notes);
      }
  return all;
}
/** Pencil changes plus the printed dominant-seventh/fifth-bass motion in the interlude. */
export function teacherChanges(source: string): Change[][] {
  const bars = voices(source)[0];
  let previous = "";
  return bars.map((notes, bar) => {
    const changes: Change[] = [];
    for (const { note, at } of notes)
      for (const chord of note.chord || [])
        if (chord.position === "default")
          changes.push({ at, chord: chord.name.replaceAll("♯", "#") });
    if (bar === 17) changes.unshift({ at: 0, chord: "A7" });
    if (bar === 19) changes.push({ at: 32, chord: "D/A" });
    if (bar === 20) changes.unshift({ at: 0, chord: "D" });
    if (!changes.length || changes[0].at > 0)
      changes.unshift({ at: 0, chord: previous });
    previous = changes.at(-1)!.chord;
    return changes;
  });
}
function top(note: Note) {
  return [...(note.pitches || [])].sort((a, b) => b.pitch - a.pitch)[0];
}
function token(event: Event, from = event.at, length = event.length) {
  const pitch = top(event.note);
  return `${pitch ? "(".repeat(pitch.startSlur?.length || 0) : ""}${pitch ? pitch.name.match(/^[\^_=]*[A-Ga-g][',]*/)?.[0] : "z"}${length}${pitch?.startTie && from + length === event.at + event.length ? "-" : ""}${pitch ? ")".repeat(pitch.endSlur?.length || 0) : ""}`;
}
/** Retain all vocal rests; after "stand", follow the printed organ's upper line. */
export function teacherMelody(source: string, guitar = false) {
  const shifted = guitar
    ? abcjs.strTranspose(source, abcjs.parseOnly(source), 10)
    : source;
  const parts = voices(shifted);
  return parts[0].map((notes, bar) =>
    bar < 16
      ? notes
      : notes
          .flatMap((event) => {
            if (top(event.note)) return [event];
            return parts[2][bar]
              .filter(
                (inner) =>
                  inner.at < event.at + event.length &&
                  inner.at + inner.length > event.at,
              )
              .map((inner) => {
                const from = Math.max(event.at, inner.at),
                  end = Math.min(
                    event.at + event.length,
                    inner.at + inner.length,
                  );
                return { ...inner, at: from, length: end - from };
              });
          })
          .reduce<Event[]>((merged, event) => {
            const previous = merged.at(-1);
            if (
              previous?.note === event.note &&
              previous.at + previous.length === event.at
            )
              previous.length += event.length;
            else merged.push({ ...event });
            return merged;
          }, []),
  );
}
export function teacherInstrumentAbc(
  hymn: { harmony: string; title: string },
  instrument: BeginnerInstrument,
  part: "right" | "left" | "both" = "both",
) {
  const guitar = instrument === "guitar",
    strumming = guitar && part === "left";
  const melody = teacherMelody(hymn.harmony, guitar),
    changes = teacherChanges(hymn.harmony);
  const names = strumming
    ? "S1"
    : guitar
      ? part === "right"
        ? "S1"
        : "(S1 S2)"
      : "{S1 S2}";
  let abc = `X:1\nT:${hymn.title}\nM:3/4\nL:1/64\nQ:1/4=80\n%%score ${names}\nV:S1 clef=${guitar ? "treble-8" : "treble"}${guitar ? " stem=up" : ""}\n${strumming || (guitar && part === "right") ? "" : `V:S2 clef=${guitar ? "treble-8 stem=down" : "bass"}\n`}K:${guitar ? "C" : "D"}\n`;
  // Keep voices continuous: hard breaks force one-bar tablature systems.
  const leadBars: string[] = [],
    bassBars: string[] = [];
  for (let bar = 0; bar < 21; bar++) {
    const end = bar === 20 ? " :|" : " |";
    const accompaniment = changes[bar]
      .map(({ at, chord }, index) => {
        const duration = (changes[bar][index + 1]?.at ?? lengths[bar]) - at;
        const name = guitar ? shapes[chord] : chord;
        // A single C bass frees the moving lower melody in the penultimate bar.
        const sound = guitar
          ? strumming
            ? strum[chord]
            : bar === 19 && at === 0
              ? "C"
              : bass[chord]
          : piano[chord];
        return `${name && strumming ? `"${name}"` : ""}${sound || "z"}${duration}`;
      })
      .join(" ");
    const lead = melody[bar]
      .map((event) => {
        const chord = changes[bar].find(
          (change) => change.at === event.at,
        )?.chord;
        const position = guitar
          ? bar === 10 && event.at === 32
            ? "VII"
            : [9, 11].includes(bar) && event.at === 0
              ? "III"
              : [9, 11].includes(bar) && event.at === 32
                ? "I"
                : ""
          : "";
        return `${bar === 0 && event.at === 0 ? "[P:Verse] " : bar === 17 && event.at === 0 ? "[P:Interlude] " : ""}${guitar && chord ? `"${shapes[chord]}"` : ""}${position ? `"^${position}"` : ""}${token(event)}`;
      })
      .join(" ");
    leadBars.push(`${strumming ? accompaniment : lead}${end}`);
    if (!strumming && (!guitar || part !== "right"))
      bassBars.push(`${accompaniment}${end}`);
  }
  abc += `[V:S1] ${leadBars.join(" ")}\n`;
  if (bassBars.length) abc += `[V:S2] ${bassBars.join(" ")}\n`;
  return beamByBeat(abc);
}
export function teacherChordLyrics(hymn: HymnLyricData & { harmony: string }) {
  let elapsed = 0;
  const onsets = teacherChanges(hymn.harmony).flatMap((bar, index) => {
    const start = elapsed;
    elapsed += lengths[index] / 64;
    return bar
      .filter((change) => change.chord)
      .map((change) => start + change.at / 64);
  });
  return accompanimentLyrics(hymn, onsets);
}
export function teacherGuitarPosition(
  pitch: number,
  chord: boolean,
  transpose = 0,
) {
  if (pitch - transpose === 40) return { str: 5, num: transpose };
  return christGuitarPosition(pitch, chord, transpose);
}
export function teacherFingers(
  instrument: BeginnerInstrument,
  bar: number,
  voice: number,
  pitches: number[],
  force = false,
) {
  if (instrument === "piano" && voice === 0 && bar >= 16) {
    const fingers: Record<number, number> =
      bar < 19
        ? { 59: 3, 62: 1, 64: 2, 66: 3 }
        : { 54: 1, 55: 2, 57: 3, 62: 5 };
    return pitches.map((p) => fingers[p] ?? null);
  }
  if (instrument === "guitar" && voice === 0 && bar === 19)
    return pitches.map((p) => ({ 54: 2, 55: 4, 57: null, 62: 1 })[p] ?? null);
  return christFingers(instrument, bar, voice, pitches, force);
}

export function teacherChordOffset(source: string, bar: number) {
  return teacherChanges(source)
    .slice(0, bar)
    .reduce(
      (sum, changes) => sum + changes.filter((change) => change.chord).length,
      0,
    );
}
