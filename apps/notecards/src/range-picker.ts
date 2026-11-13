import { createElement } from "react";
import { PIANO_POSITIONS } from "./piano-model";
import { mountPracticeControls } from "./practice-surfaces";
import { PitchPicker, pitchPickerState } from "./pitch-picker";
const pickers = new Set<() => void>();
export function closePitchPickers() {
  pickers.forEach((close) => close());
}
/** Imperative music controllers expose values; React owns the picker overlay. */
export class RangePicker {
  private model = pitchPickerState({ value: 0, open: false });
  constructor(
    private input: HTMLInputElement,
    button: HTMLButtonElement,
    private commit: (note: string) => void,
    private positions: readonly string[] = PIANO_POSITIONS,
    private options: { chromatic?: boolean; optional?: boolean } = {},
  ) {
    pickers.add(() => this.close());
    input.readOnly = true;
    const field = input.parentElement!;
    const slot = document.createElement("div");
    slot.className = "pitch-picker-control";
    field.before(slot);
    for (const element of [input, button]) {
      element.setAttribute("aria-controls", `${input.id}-picker`);
      element.setAttribute("aria-expanded", "false");
      element.setAttribute("aria-haspopup", "dialog");
    }
    const toggle = () =>
      this.model.set({
        ...this.model.getSnapshot(),
        open: !this.model.getSnapshot().open,
      });
    field.addEventListener("click", toggle);
    input.addEventListener("keydown", (event) => {
      if (
        (event.altKey && event.key === "ArrowDown") ||
        ["F4", "Enter", " "].includes(event.key)
      ) {
        event.preventDefault();
        toggle();
        return;
      }
      const row = options.chromatic ? 12 : 7;
      const steps: Record<string, number> = {
        ArrowUp: 1,
        ArrowDown: -1,
        PageUp: row,
        PageDown: -row,
      };
      if (event.key in steps) {
        event.preventDefault();
        const index = Math.max(
          this.options.optional ? -1 : 0,
          Math.min(
            this.positions.length - 1,
            this.model.getSnapshot().value + steps[event.key],
          ),
        );
        this.commit(this.positions[index] || "");
      }
    });
    mountPracticeControls(
      slot,
      createElement(PitchPicker, {
        model: this.model,
        field,
        input,
        button,
        positions,
        ...options,
        commit: (index) => {
          this.commit(this.positions[index] || "");
          this.close();
        },
      }),
    );
    window.addEventListener("resize", () => this.close());
  }
  close() {
    this.model.set({ ...this.model.getSnapshot(), open: false });
  }
  setValue(note: string) {
    const value = this.positions.indexOf(note);
    this.model.set({ ...this.model.getSnapshot(), value });
    this.input.value = this.positions[value] || "None";
    this.input.title = this.input.value;
    this.input.setCustomValidity("");
    this.input.removeAttribute("aria-invalid");
  }
}
