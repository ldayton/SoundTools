import type { AbsoluteElement, RelativeElement, TuneObject } from "abcjs";

// abcjs indexes strings from high E (0); diagrams run from low E to high E.
export type StringPosition = { str: number; num: number };
export type FingeringNote = {
  start: number;
  duration: number;
  positions: readonly StringPosition[] | undefined;
};
export type ChordPassage = {
  name: string;
  element: SVGGraphicsElement;
  shapes: (number | null)[][];
  capo: number;
};
const epsilon = 1e-7;

/** Actual simultaneous notes, never a union of incompatible melody positions. */
export function passageFingerings(
  notes: readonly FingeringNote[],
  from: number,
  to: number,
) {
  const times = [
    ...new Set([
      from,
      ...notes.flatMap((n) => [n.start, n.start + n.duration]),
    ]),
  ]
    .filter((t) => t >= from - epsilon && t < to - epsilon)
    .sort((a, b) => a - b);
  const shapes: (number | null)[][] = [];
  for (const time of times) {
    const shape: (number | null)[] = Array(6).fill(null);
    for (const note of notes) {
      if (
        note.start > time + epsilon ||
        note.start + note.duration <= time + epsilon
      )
        continue;
      if (!note.positions) return []; // An unknown fret must not become an invented chord shape.
      for (const { str, num } of note.positions) {
        if (
          !Number.isInteger(str) ||
          str < 0 ||
          str > 5 ||
          !Number.isInteger(num) ||
          num < 0 ||
          num > 24
        )
          return [];
        const index = 5 - str;
        if (shape[index] !== null && shape[index] !== num) return [];
        shape[index] = num;
      }
    }
    if (!shapes.length || shape.some((f, i) => f !== shapes.at(-1)![i]))
      shapes.push(shape);
  }
  return shapes.some((s) => s.some((f) => f !== null)) ? shapes : [];
}

type PositionFor = (
  pitch: number,
  chord: boolean,
  transpose: number,
  group?: readonly number[],
) => StringPosition | undefined;
type TabNote = {
  startChar?: number;
  grace?: boolean;
  notes?: { str: number; num: number | string }[];
};
type ChordInk = RelativeElement & { graphelem?: SVGGraphicsElement };

/** Bind each printed chord to the same string/fret choices as its rendered tab. */
export function scoreChordPassages(
  tune: TuneObject,
  {
    positionFor,
    capo = 0,
    transpose = 0,
  }: { positionFor?: PositionFor; capo?: number; transpose?: number } = {},
): ChordPassage[] {
  const tab = new Map<number, StringPosition[]>();
  const tabVoices = new Set<string>();
  // Grace notes have separate fret markers but no independent notated duration.
  for (const line of tune.lines)
    for (const staff of line.staff || []) {
      if (String(staff.clef?.type) !== "TAB") continue;
      for (const voice of staff.voices || [])
        for (const item of voice) {
          const n = item as unknown as TabNote;
          if (n.startChar !== undefined && n.notes?.length && !n.grace)
            tab.set(
              n.startChar,
              n.notes.map((p) => ({ str: p.str, num: Number(p.num) })),
            );
        }
    }
  for (const line of tune.lines)
    for (const [si, staff] of (line.staff || []).entries()) {
      if (String(staff.clef?.type) === "TAB") continue;
      for (const [vi, voice] of (staff.voices || []).entries())
        if (
          voice.some(
            (n) =>
              n.el_type === "note" &&
              n.startChar !== undefined &&
              tab.has(n.startChar),
          )
        )
          tabVoices.add(`${si}:${vi}`);
    }
  const clocks = new Map<string, number>();
  const previous = new Map<string, Map<number, StringPosition | undefined>>();
  const notes: FingeringNote[] = [];
  const markers: { name: string; element: SVGGraphicsElement; time: number }[] =
    [];
  for (const line of tune.lines)
    for (const [si, staff] of (line.staff || []).entries()) {
      if (String(staff.clef?.type) === "TAB") continue;
      for (const [vi, voice] of (staff.voices || []).entries()) {
        const key = `${si}:${vi}`;
        const tied =
          previous.get(key) || new Map<number, StringPosition | undefined>();
        previous.set(key, tied);
        let time = clocks.get(key) || 0;
        for (const n of voice) {
          if (n.el_type !== "note") continue;
          const absolute = (n as typeof n & { abselem?: AbsoluteElement })
            .abselem;
          for (const child of absolute?.children || []) {
            const ink = child as ChordInk;
            if (ink.type === "chord" && ink.graphelem)
              markers.push({
                name: ink.graphelem.textContent?.trim() || "",
                element: ink.graphelem,
                time,
              });
          }
          if (!tab.size || tabVoices.has(key)) {
            let positions =
              n.startChar === undefined ? undefined : tab.get(n.startChar);
            if (!tab.size && positionFor) {
              const attacks = [...(n.midiPitches || [])];
              const mapped = (n.pitches || []).map((p) => {
                const midi = p.endTie ? undefined : attacks.shift();
                const position = p.endTie
                  ? tied.get(p.pitch)
                  : midi
                    ? positionFor(
                        midi.pitch - capo,
                        (n.pitches?.length || 0) > 1,
                        transpose,
                        (n.midiPitches || []).map((p:{pitch:number})=>p.pitch-capo),
                      )
                    : undefined;
                tied.set(p.pitch, position);
                return position;
              });
              positions = mapped.every((p): p is StringPosition => !!p)
                ? mapped
                : undefined;
            }
            notes.push({
              start: time,
              duration: n.duration,
              positions: n.pitches?.length ? positions : [],
            });
          }
          time += n.duration;
        }
        clocks.set(key, time);
      }
    }
  markers.sort((a, b) => a.time - b.time);
  const end = Math.max(0, ...notes.map((n) => n.start + n.duration));
  return markers.flatMap((marker) => {
    const next =
      markers.find((m) => m.time > marker.time + epsilon)?.time ?? end;
    const shapes = passageFingerings(notes, marker.time, next);
    return marker.name && shapes.length ? [{ ...marker, shapes, capo }] : [];
  });
}

/** Reserve one height for the passage, even when a melody note changes position. */
export function fingeringWindow(
  shapes: readonly (readonly (number | null)[])[],
  frame = 0,
) {
  const windows = shapes.map((shape) => {
    const frets = shape.filter((f): f is number => f !== null && f > 0);
    const base =
      frets.length && Math.min(...frets) > 3 ? Math.min(...frets) : 1;
    return { base, rows: Math.max(4, ...frets.map((f) => f - base + 1)) };
  });
  return {
    base: windows[frame]?.base ?? 1,
    rows: Math.max(4, ...windows.map((w) => w.rows)),
  };
}
