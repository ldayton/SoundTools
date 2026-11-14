import { createElement, useSyncExternalStore } from "react";
import { PitchField, type PitchChoice } from "@ldayton/ui/pitch-field";
import { createViewState } from "./view-state";
import { PIANO_POSITIONS } from "./piano-model";
import { mountPracticeControls } from "./practice-surfaces";
const pickers = new Set<() => void>();
export function closePitchPickers() {
  pickers.forEach((close) => close());
}
/** Translate app-specific written pitches into the shared controlled field. */
export class RangePicker {
  private model = createViewState({ value: 0, open: false });
  constructor(
    input: HTMLInputElement,
    _button: HTMLButtonElement,
    commit: (note: string) => void,
    private positions: readonly string[] = PIANO_POSITIONS,
    options: { chromatic?: boolean; optional?: boolean } = {},
  ) {
    pickers.add(() => this.close());
    const id = input.id,
      label = input.getAttribute("aria-label")!;
    const field = input.parentElement!,
      slot = document.createElement("div");
    slot.className =
      "pitch-picker-control" +
      (field.classList.contains("optional-note-desktop")
        ? " optional-note-desktop"
        : "");
    field.replaceWith(slot);
    const letters = options.chromatic
      ? ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
      : [..."CDEFGAB"];
    const choices: PitchChoice[] = positions.map((note, value) => {
      const match = /^(.*?)(-?\d+)$/.exec(note)!;
      return {
        value,
        label: note,
        octave: Number(match[2]),
        column: letters.indexOf(match[1]),
      };
    });
    const model = this.model;
    function Field() {
      const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
      return createElement(PitchField, {
        id,
        label,
        value: state.value,
        opened: state.open,
        choices,
        columns: options.chromatic ? 12 : 7,
        optional: options.optional,
        onOpenedChange: (open) => model.set({ ...model.getSnapshot(), open }),
        onChange: (value) => commit(positions[value] || ""),
      });
    }
    mountPracticeControls(slot, createElement(Field));
  }
  close() {
    this.model.set({ ...this.model.getSnapshot(), open: false });
  }
  setValue(note: string) {
    this.model.set({
      ...this.model.getSnapshot(),
      value: this.positions.indexOf(note),
    });
  }
}
