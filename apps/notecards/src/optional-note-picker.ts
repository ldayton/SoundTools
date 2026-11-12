import { NoteWheel } from "@ldayton/browser-controls/note-wheel";
import { RangePicker } from "./range-picker";
import { keyLabel } from "./piano-model";
const LOW = 21,
  HIGH = 108,
  NONE = LOW - 1;
export const selectableNoteLabel = (midi: number) =>
  keyLabel(midi, false).split(" / ")[0] + (Math.floor(midi / 12) - 1);
export function optionalNoteHTML(id: string, label: string) {
  return `<div class="optional-note-control"><div class="optional-note-label"><label for="${id}">${label}</label><button type="button" class="optional-note-clear" aria-label="Clear ${label.toLowerCase()}">None</button></div><div class="note-field optional-note-desktop"><input id="${id}" aria-label="${label}" readonly/><button type="button" id="${id}-choose" aria-label="Choose ${label.toLowerCase()}">⌄</button></div><div class="note-spinner optional-note-mobile"><span class="note-wheel-selection" aria-hidden="true"></span><div id="${id}-wheel" class="note-wheel" role="spinbutton" tabindex="0" aria-label="${label}" aria-valuemin="${NONE}" aria-valuemax="${HIGH}"></div></div></div>`;
}
/** Same desktop grid as staff practice and same mobile wheel as DoReGo. */
export class OptionalNotePicker {
  private picker: RangePicker;
  private wheel: NoteWheel;
  private clear: HTMLButtonElement;
  constructor(
    element: HTMLElement,
    id: string,
    commit: (note: number | null) => void,
  ) {
    const notes = Array.from({ length: HIGH - LOW + 1 }, (_, i) =>
      selectableNoteLabel(i + LOW),
    );
    this.picker = new RangePicker(
      element.querySelector<HTMLInputElement>(`#${id}`)!,
      element.querySelector<HTMLButtonElement>(`#${id}-choose`)!,
      (value) => commit(value ? notes.indexOf(value) + LOW : null),
      notes,
      { chromatic: true, optional: true },
    );
    this.wheel = new NoteWheel(
      element.querySelector<HTMLElement>(`#${id}-wheel`)!,
      (value) => commit(value === NONE ? null : value),
      {
        low: NONE,
        high: HIGH,
        label: (value) =>
          value === NONE ? "None" : selectableNoteLabel(value),
        keyboard: true,
      },
    );
    this.clear = element.querySelector<HTMLButtonElement>(
      ".optional-note-clear",
    )!;
    this.clear.onclick = () => {
      this.picker.close();
      commit(null);
    };
  }
  setValue(value: number | null) {
    this.picker.setValue(value === null ? "" : selectableNoteLabel(value));
    this.wheel.setValue(value ?? NONE);
    this.clear.style.visibility = value === null ? "hidden" : "visible";
  }
  close() {
    this.picker.close();
  }
}
