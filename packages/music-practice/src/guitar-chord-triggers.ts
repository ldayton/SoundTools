import {attachChordTriggers} from "./chord-triggers";
import type {ChordPassage} from "./chord-passage-fingering";
export const guitarChordEvent = "songalong:guitar-chord";
export type GuitarChordSelection = Pick<ChordPassage, "name" | "shapes" | "capo"> & {
  trigger: SVGElement | HTMLElement;
  descriptions?: string[];
};
export function showGuitarChordDiagram(selection: GuitarChordSelection) {
  window.dispatchEvent(
    new CustomEvent<GuitarChordSelection>(guitarChordEvent, { detail: selection }),
  );
}
/** Enlarge chord hit targets without changing engraving or passage selection. */
export function attachChordDiagrams(
  paper: HTMLElement,
  passages: readonly ChordPassage[],
) {
  attachChordTriggers(
    paper,
    passages,
    "guitar-chord-trigger",
    (passage, trigger) => showGuitarChordDiagram({ ...passage, trigger }),
  );
}
