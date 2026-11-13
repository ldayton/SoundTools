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
    private options: { chromatic?: boolean; optional?: boolean } = {},
  ) {
    const title = input.getAttribute("aria-label")!;
    input.readOnly = true;
    this.popover = document.createElement("div");
    this.popover.id = `${input.id}-picker`;
    this.popover.className =
      "note-picker" + (options.chromatic ? " is-chromatic" : "");
    this.popover.setAttribute("popover", "auto");
    this.popover.setAttribute("role", "dialog");
    this.popover.setAttribute("aria-label", `Choose ${title.toLowerCase()}`);
    const octaves = [
      ...new Set(positions.map((n) => Number(n.match(/-?\d+$/)![0]))),
    ];
    const letters = options.chromatic
      ? ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
      : [..."CDEFGAB"];
    this.popover.innerHTML = `<div class="note-picker-title">${title}</div>${options.optional ? `<button type="button" class="note-picker-none" data-position="-1">None</button>` : ""}<div class="note-picker-grid" role="group" aria-label="Notes by octave">${octaves
      .map(
        (octave) =>
          `<span class="note-picker-octave" aria-hidden="true">${octave}</span>${letters
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
        ArrowUp: -letters.length,
        ArrowDown: letters.length,
      };
      if (!(event.key in steps)) return;
      event.preventDefault();
      const index = Math.max(
        this.options.optional ? -1 : 0,
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
        input.value = this.noteLabel(this.value) || "None";
        input.setCustomValidity("");
        input.removeAttribute("aria-invalid");
        return;
      }
      const steps: Record<string, number> = {
        ArrowUp: 1,
        ArrowDown: -1,
        PageUp: letters.length,
        PageDown: -letters.length,
      };
      if (event.key in steps) {
        event.preventDefault();
        this.commit(
          this.noteLabel(
            Math.max(
              this.options.optional ? -1 : 0,
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
    window.addEventListener(
      "scroll",
      (event) => {
        if (
          this.popover.matches(":popover-open") &&
          !(event.target instanceof Node && this.popover.contains(event.target))
        )
          this.position();
      },
      true,
    );
  }
  private noteLabel(index: number) {
    return this.positions[index] || "";
  }
  private toggle() {
    if (this.popover.matches(":popover-open")) {
      this.close();
      return;
    }
    this.popover.showPopover();
    this.position();
    const selected = this.popover.querySelector<HTMLButtonElement>(
      `[data-position="${this.value}"]`,
    )!;
    selected.scrollIntoView({ block: "nearest", inline: "nearest" });
    selected.focus({ preventScroll: true });
  }
  private position() {
    const anchor = this.input.parentElement!.getBoundingClientRect();
    const scrollPanel = this.input.closest(".practice-options-content");
    const panelBounds = scrollPanel?.getBoundingClientRect();
    if (
      anchor.bottom <= 0 ||
      anchor.top >= innerHeight ||
      (panelBounds &&
        (anchor.bottom <= panelBounds.top || anchor.top >= panelBounds.bottom))
    ) {
      this.close();
      return;
    }
    const padding = 12,
      gap = 8;
    const below = innerHeight - anchor.bottom - gap - padding;
    const above = anchor.top - gap - padding;
    const openBelow = below >= 160 || below >= above;
    this.popover.style.maxHeight = `${Math.max(0, openBelow ? below : above)}px`;
    const box = this.popover.getBoundingClientRect();
    const left =
      anchor.left + box.width <= innerWidth - padding
        ? anchor.left
        : anchor.right - box.width;
    this.popover.style.left = `${Math.max(padding, Math.min(left, innerWidth - box.width - padding))}px`;
    this.popover.style.top = `${openBelow ? anchor.bottom + gap : Math.max(padding, anchor.top - gap - box.height)}px`;
  }
  close() {
    if (this.popover.matches(":popover-open")) this.popover.hidePopover();
  }
  setValue(note: string) {
    const index = this.positions.indexOf(note);
    this.value = index;
    this.input.value = this.noteLabel(index) || "None";
    this.input.title = this.noteLabel(index) || "None";
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
