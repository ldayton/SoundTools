import type { AbsoluteElement, RelativeElement, TuneObject } from "abcjs";
import { attachChordTriggers } from "./chord-triggers";
import { pianoChord } from "./piano-chord";
export const pianoChordEvent = "songalong:piano-chord";
export type PianoChordSelection = NonNullable<ReturnType<typeof pianoChord>> & {
  name: string;
  trigger: SVGElement;
};
/** Use engraved/transposed chord names, so symbols and diagrams always agree. */
export function attachPianoChordDiagrams(paper: HTMLElement, tune: TuneObject) {
  const passages: (PianoChordSelection & { element: SVGGraphicsElement })[] =
    [];
  for (const line of tune.lines)
    for (const staff of line.staff || [])
      for (const voice of staff.voices || [])
        for (const note of voice) {
          if (note.el_type !== "note") continue;
          const absolute = (note as typeof note & { abselem?: AbsoluteElement })
            .abselem;
          for (const child of absolute?.children || []) {
            const ink = child as RelativeElement & {
              graphelem?: SVGGraphicsElement;
            };
            if (ink.type !== "chord" || !ink.graphelem) continue;
            const name = ink.graphelem.textContent?.trim() || "";
            const chord = pianoChord(name);
            if (chord)
              passages.push({
                ...chord,
                name,
                element: ink.graphelem,
                trigger: ink.graphelem,
              });
          }
        }
  attachChordTriggers(
    paper,
    passages,
    "piano-chord-trigger",
    (passage, trigger) =>
      window.dispatchEvent(
        new CustomEvent<PianoChordSelection>(pianoChordEvent, {
          detail: { ...passage, trigger },
        }),
      ),
  );
}
