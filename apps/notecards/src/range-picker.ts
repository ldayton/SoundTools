import { PIANO_POSITIONS } from "./piano-model";
/** DoReGo-style picker for written staff positions; the key signature supplies accidentals. */
export class RangePicker {
  private value = 0;
  private popover: HTMLDivElement;
  constructor(
    private input: HTMLInputElement,
    private button: HTMLButtonElement,
    private commit: (note: string) => void,
    private positions: readonly string[] = PIANO_POSITIONS,
  ) {
    const title = input.getAttribute("aria-label")!;
    input.readOnly = true;
    this.popover = document.createElement("div");
    this.popover.id = `${input.id}-picker`;
    this.popover.className = "note-picker";
    this.popover.setAttribute("popover", "auto");
    this.popover.setAttribute("role", "dialog");
    this.popover.setAttribute("aria-label", `Choose ${title.toLowerCase()}`);
    const octaves = [...new Set(positions.map((n) => Number(n.slice(1))))];
    this.popover.innerHTML = `<div class="note-picker-title">${title}</div><div class="note-picker-grid" role="group" aria-label="Notes by octave">${octaves
      .map(
        (octave) =>
          `<span class="note-picker-octave" aria-hidden="true">${octave}</span>${[
            ..."CDEFGAB",
          ]
            .map((letter) => {
              const note = letter + octave;
              const index = positions.indexOf(note);
              return index < 0
                ? "<span></span>"
                : `<button type="button" data-position="${index}" tabindex="-1" aria-label="${note}" title="${note}"><span>${note}</span></button>`;
            })
            .join("")}`,
      )
      .join("")}</div>`;
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
      this.commit(this.noteLabel(Number(selected.dataset.position)));
      this.close();
      input.focus({ preventScroll: true });
    });
    this.popover.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
        input.focus({ preventScroll: true });
        return;
      }
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
          this.positions.length - 1,
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
        event.preventDefault();
        input.value = this.noteLabel(this.value);
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
          this.noteLabel(
            Math.max(
              0,
              Math.min(
                this.positions.length - 1,
                this.value + steps[event.key],
              ),
            ),
          ),
        );
      }
    });
    window.addEventListener("resize", () => this.close());
  }
  private noteLabel(index: number) {
    return this.positions[index];
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
    const index = this.positions.indexOf(note);
    this.value = index;
    this.input.value = this.noteLabel(index);
    this.input.title = this.noteLabel(index);
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
