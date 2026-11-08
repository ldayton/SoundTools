import { PIANO_POSITIONS } from "./piano-model";
const noteChoiceLabel = (index: number) => PIANO_POSITIONS[index];
/** DoReGo-style picker for written staff positions; the key signature supplies accidentals. */
export class RangePicker {
  private value = 0;
  private popover: HTMLDivElement;
  constructor(
    private input: HTMLInputElement,
    private button: HTMLButtonElement,
    private commit: (note: string) => void,
  ) {
    const title = input.getAttribute("aria-label")!;
    input.readOnly = true;
    this.popover = document.createElement("div");
    this.popover.id = `${input.id}-picker`;
    this.popover.className = "note-picker";
    this.popover.setAttribute("popover", "auto");
    this.popover.setAttribute("role", "dialog");
    this.popover.setAttribute("aria-label", `Choose ${title.toLowerCase()}`);
    this.popover.innerHTML = `<div class="note-picker-title">${title}</div><div class="note-picker-grid" role="group" aria-label="Notes by octave">${Array.from(
      { length: 5 },
      (_, row) =>
        `<span class="note-picker-octave" aria-hidden="true">${row + 2}</span>${Array.from(
          { length: 7 },
          (_, pitch) => {
            const index = row * 7 + pitch;
            return index < PIANO_POSITIONS.length
              ? `<button type="button" data-position="${index}" tabindex="-1" aria-label="${noteChoiceLabel(index)}" title="${noteChoiceLabel(index)}"><span>${noteChoiceLabel(index)}</span></button>`
              : "<span></span>";
          },
        ).join("")}`,
    ).join("")}</div>`;
    document.body.append(this.popover);
    for (const element of [input, button]) {
      element.setAttribute("aria-controls", this.popover.id);
      element.setAttribute("aria-expanded", "false");
      element.setAttribute("aria-haspopup", "dialog");
    }
    input.parentElement!.addEventListener("click", () => this.toggle());
    this.popover.addEventListener("toggle", () => {
      const open = this.popover.matches(":popover-open");
      input.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-expanded", String(open));
    });
    this.popover.addEventListener("click", (event) => {
      const selected = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-position]",
      );
      if (!selected) return;
      this.commit(noteChoiceLabel(Number(selected.dataset.position)));
      this.close();
      input.focus({ preventScroll: true });
    });
    this.popover.addEventListener("keydown", (event) => {
      const selected = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-position]",
      );
      if (!selected) return;
      const steps: Record<string, number> = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowUp: -7,
        ArrowDown: 7,
      };
      if (!(event.key in steps)) return;
      event.preventDefault();
      const index = Math.max(
        0,
        Math.min(
          PIANO_POSITIONS.length - 1,
          Number(selected.dataset.position) + steps[event.key],
        ),
      );
      selected.tabIndex = -1;
      const next = this.popover.querySelector<HTMLButtonElement>(
        `[data-position="${index}"]`,
      )!;
      next.tabIndex = 0;
      next.focus();
    });
    input.addEventListener("keydown", (event) => {
      if ((event.altKey && event.key === "ArrowDown") || event.key === "F4") {
        event.preventDefault();
        this.toggle();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.toggle();
        return;
      }
      if (event.key === "Escape") {
        input.value = noteChoiceLabel(this.value);
        input.setCustomValidity("");
        input.removeAttribute("aria-invalid");
        return;
      }
      const steps: Record<string, number> = {
        ArrowUp: 1,
        ArrowDown: -1,
        PageUp: 7,
        PageDown: -7,
      };
      if (event.key in steps) {
        event.preventDefault();
        this.commit(
          noteChoiceLabel(
            Math.max(
              0,
              Math.min(
                PIANO_POSITIONS.length - 1,
                this.value + steps[event.key],
              ),
            ),
          ),
        );
      }
    });
    window.addEventListener("resize", () => this.close());
  }
  private toggle() {
    if (this.popover.matches(":popover-open")) {
      this.close();
      return;
    }
    this.popover.showPopover();
    const anchor = this.input.parentElement!.getBoundingClientRect();
    const box = this.popover.getBoundingClientRect();
    this.popover.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - box.width - 12))}px`;
    this.popover.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, innerHeight - box.height - 12))}px`;
    this.popover
      .querySelector<HTMLButtonElement>(`[data-position="${this.value}"]`)!
      .focus({ preventScroll: true });
  }
  close() {
    if (this.popover.matches(":popover-open")) this.popover.hidePopover();
  }
  setValue(note: string) {
    const index = PIANO_POSITIONS.indexOf(note);
    this.value = index;
    this.input.value = noteChoiceLabel(index);
    this.input.title = noteChoiceLabel(index);
    this.input.setCustomValidity("");
    this.input.removeAttribute("aria-invalid");
    for (const button of this.popover.querySelectorAll<HTMLButtonElement>(
      "[data-position]",
    )) {
      const selected = Number(button.dataset.position) === index;
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  }
}
