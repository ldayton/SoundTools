import type { AbsoluteElement, TuneObject } from "abcjs";
import {
  planGuitarPhrase,
  type GuitarPhraseNote,
} from "./guitar-phrase-fingering";
const ns = "http://www.w3.org/2000/svg";
type TabNote = {
  startChar: number;
  notes?: { num: number | string; str: number }[];
  abselem?: AbsoluteElement;
};
/** Standard guitar finger numbers beside melody noteheads; tab remains fret numbers. */
export function drawGuitarFingerings(tune: TuneObject, chords: boolean) {
  if (chords) return;
  const sources = new Map<
    number,
    {
      start: number;
      voice: string;
      duration: number;
      ties: boolean[];
      absolute?: AbsoluteElement;
    }
  >();
  const clocks = new Map<string, number>();
  for (const line of tune.lines)
    for (const [si, staff] of (line.staff || []).entries()) {
      if (String(staff.clef?.type) === "TAB") continue;
      for (const [vi, voice] of (staff.voices || []).entries()) {
        const id = `${si}:${vi}`;
        let start = clocks.get(id) || 0;
        for (const item of voice) {
          if (item.el_type !== "note") continue;

          sources.set(item.startChar, {
            start,
            voice: id,
            duration: item.duration,
            ties: (item.pitches || []).map((p) => !!p.endTie),
            absolute: (item as typeof item & { abselem?: AbsoluteElement })
              .abselem,
          });
          start += item.duration * 4;
        }
        clocks.set(id, start);
      }
    }
  const entries: {
    tab: TabNote;
    group: SVGGraphicsElement;
    notes: GuitarPhraseNote[];
  }[] = [];
  for (const line of tune.lines)
    for (const staff of line.staff || []) {
      if (String(staff.clef?.type) !== "TAB") continue;
      for (const voice of staff.voices || [])
        for (const item of voice) {
          const tab = item as unknown as TabNote;
          const group = tab.abselem?.elemset[0] as unknown as
            SVGGraphicsElement | undefined;
          if (!tab.notes?.length || !group) continue;
          const source = sources.get(tab.startChar);
          entries.push({
            tab,
            group,
            notes: tab.notes.map((n, index) => ({
              id: `${tab.startChar}:${index}`,
              start: source?.start || 0,
              string: n.str + 1,
              fret: Number(n.num),
              duration: (source?.duration || 0.25) * 4,
            })),
          });
        }
    }
  // Unsupported tab symbols/registers must not prevent the score from loading.
  if (
    !chords &&
    entries.some((entry) =>
      entry.notes.some(
        (note) =>
          !Number.isInteger(note.fret) || note.fret < 0 || note.fret > 24,
      ),
    )
  )
    return;
  const held = new Map<string, string>();
  for (const entry of entries) {
    const source = sources.get(entry.tab.startChar);
    entry.notes.forEach((note, index) => {
      const key = `${source?.voice}:${note.string}:${note.fret}`;
      if (source?.ties[index]) note.tieFrom = held.get(key);
      held.set(key, note.id);
    });
  }
  const plan = planGuitarPhrase(entries.flatMap((e) => e.notes));
  if (!plan) return;
  const planned = new Map(plan.notes.map((n) => [n.id, n]));
  let priorPosition: number | undefined;
  for (const { tab, notes } of entries) {
    const source = sources.get(tab.startChar);
    const staffGroup = source?.absolute?.elemset[0] as unknown as
      SVGGraphicsElement | undefined;
    const texts = [
      ...(staffGroup?.querySelectorAll<SVGGraphicsElement>(".abcjs-notehead") ||
        []),
    ];
    if (!staffGroup || !texts.length) continue;
    const position = planned.get(notes[0].id)!.position,
      shift = priorPosition !== undefined && position !== priorPosition;
    priorPosition = position;
    for (const [i, note] of notes.entries()) {
      const finger = planned.get(note.id)!.finger;
      if (!finger || !texts[i] || source?.ties[i]) continue;
      const box = texts[i].getBBox();
      const mark = document.createElementNS(ns, "text");
      mark.setAttribute("x", String(box.x - 9));
      mark.setAttribute("y", String(box.y + box.height / 2 + 4));
      mark.setAttribute("font-size", "11");
      mark.setAttribute("font-family", "sans-serif");
      mark.setAttribute("font-weight", "400");
      mark.setAttribute("fill", "currentColor");
      mark.setAttribute("paint-order", "stroke");
      mark.setAttribute("stroke", "var(--mantine-color-body, white)");
      mark.setAttribute("stroke-width", "2");
      mark.classList.add("guitar-fingering");
      mark.dataset.finger = String(finger);
      mark.dataset.fret = String(note.fret);
      mark.dataset.string = String(note.string);
      mark.textContent = String(finger);
      const title = document.createElementNS(ns, "title");
      title.textContent = `String ${note.string}, fret ${note.fret}: finger ${finger}`;
      mark.append(title);
      staffGroup.append(mark);
    }
    if (shift && texts[0]) {
      const roman = [
        "",
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI",
        "VII",
        "VIII",
        "IX",
        "X",
        "XI",
        "XII",
      ];
      const mark = document.createElementNS(ns, "text"),
        box = texts[0].getBBox();
      mark.setAttribute("x", String(box.x - 9));
      mark.setAttribute("y", String(box.y - 12));
      mark.setAttribute("font-size", "10");
      mark.setAttribute("fill", "currentColor");
      mark.classList.add("guitar-position");
      mark.textContent = roman[position] || String(position);
      mark.setAttribute("aria-label", `Shift to position ${position}`);
      staffGroup.append(mark);
    }
  }
}
