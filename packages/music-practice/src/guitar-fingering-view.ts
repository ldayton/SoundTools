import type { AbsoluteElement, TuneObject } from "abcjs";
import { planGuitarFingering, type GuitarFingerNote } from "./guitar-fingering";
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
    { duration: number; restBefore: boolean; absolute?: AbsoluteElement }
  >();
  for (const line of tune.lines)
    for (const staff of line.staff || []) {
      if (String(staff.clef?.type) === "TAB") continue;
      for (const voice of staff.voices || []) {
        let rest = false;
        for (const item of voice) {
          if (item.el_type !== "note") continue;
          if (!item.pitches?.length) {
            rest = true;
            continue;
          }
          sources.set(item.startChar, {
            duration: item.duration,
            absolute: (item as typeof item & { abselem?: AbsoluteElement })
              .abselem,
            restBefore: rest,
          });
          rest = false;
        }
      }
    }
  const entries: {
    tab: TabNote;
    group: SVGGraphicsElement;
    notes: GuitarFingerNote[];
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
            notes: tab.notes.map((n) => ({
              string: n.str + 1,
              fret: Number(n.num),
              duration: source?.duration || 0.25,
              restBefore: source?.restBefore,
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
  const melody = chords
    ? []
    : planGuitarFingering(
        entries.flatMap((e) => (e.notes.length === 1 ? e.notes : [])),
      );
  let at = 0;
  for (const { tab, notes } of entries) {
    if (notes.length !== 1) continue;
    const planned = melody[at++];
    const source = sources.get(tab.startChar);
    const staffGroup = source?.absolute?.elemset[0] as unknown as
      SVGGraphicsElement | undefined;
    const head =
      staffGroup?.querySelector<SVGGraphicsElement>(".abcjs-notehead");
    if (!staffGroup || !head) continue;
    const texts = [head];
    const fingers = [planned.finger];
    const shift = planned.shift,
      position = planned.position;
    for (const [i, finger] of fingers.entries()) {
      if (!finger || !texts[i]) continue;
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
      mark.dataset.fret = String(notes[i].fret);
      mark.dataset.string = String(notes[i].string);
      mark.textContent = String(finger);
      const title = document.createElementNS(ns, "title");
      title.textContent = `String ${notes[i].string}, fret ${notes[i].fret}: finger ${finger}`;
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
