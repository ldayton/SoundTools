import { isBlack, keyLabel } from "./piano-model";
/** Native buttons preserve precise hit testing, focus, and screen-reader access. */
export class Piano {
  private locked = false;
  private signature = "";
  private focusMidi = 60;
  constructor(
    private element: HTMLElement,
    private answer: (midi: number) => void,
  ) {
    element.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-piano]",
      );
      if (button && !this.locked) this.answer(Number(button.dataset.piano));
    });
    element.addEventListener("keydown", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-piano]",
      );
      if (!button) return;
      if (event.repeat && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        return;
      }
      const keys = this.buttons();
      const index = keys.indexOf(button);
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? keys.length - 1
            : event.key === "ArrowLeft"
              ? Math.max(0, index - 1)
              : event.key === "ArrowRight"
                ? Math.min(keys.length - 1, index + 1)
                : -1;
      if (target < 0 || this.locked) return;
      event.preventDefault();
      this.focusMidi = Number(keys[target].dataset.piano);
      keys.forEach((key, i) => (key.tabIndex = i === target ? 0 : -1));
      keys[target].focus({ preventScroll: true });
    });
  }
  private buttons() {
    return [
      ...this.element.querySelectorAll<HTMLButtonElement>("[data-piano]"),
    ];
  }
  show(low: number, high: number, named: boolean) {
    const hadFocus = this.element.contains(document.activeElement);
    const signature = `${low}:${high}:${named}`;
    if (this.signature !== signature) {
      this.signature = signature;
      const rows: string[] = [];
      const allWhites = Array.from(
        { length: high - low + 1 },
        (_, i) => low + i,
      ).filter((n) => !isBlack(n));
      const ranges: [number, number][] = [[low, high]];
      if (allWhites.length > 8) {
        // Split at a natural gap (E/F or B/C), never through a black key.
        const splits = allWhites
          .slice(1)
          .filter((n) => n % 12 === 0 || n % 12 === 5);
        const split = splits.sort(
          (a, b) =>
            Math.abs(allWhites.indexOf(a) - allWhites.length / 2) -
            Math.abs(allWhites.indexOf(b) - allWhites.length / 2),
        )[0];
        ranges.splice(0, 1, [low, split - 1], [split, high]);
      }
      for (const [start, end] of ranges) {
        const whites = Array.from(
          { length: end - start + 1 },
          (_, i) => start + i,
        ).filter((n) => !isBlack(n));
        const keys = Array.from(
          { length: end - start + 1 },
          (_, i) => start + i,
        )
          .map((midi) => {
            const black = isBlack(midi),
              index = whites.filter((n) => n < midi).length;
            const position = black
              ? `left:calc(${index} * var(--white) - var(--black) / 2)`
              : `left:calc(${index} * var(--white))`;
            return `<button type="button" class="piano-key ${black ? "black-key" : "white-key"}" data-piano="${midi}" aria-label="${keyLabel(midi, !named)}" tabindex="-1" style="${position}"></button>`;
          })
          .join("");
        rows.push(
          `<div class="piano-octave" style="--whites:${whites.length}"><div class="piano-keys">${keys}</div></div>`,
        );
      }
      this.element.innerHTML = `<div class="piano-layout ${named ? "piano-named" : "piano-staff"}" role="group" aria-label="Piano answer keys">${rows.join("")}</div>`;
    }
    this.locked = false;
    this.focusMidi = low;
    for (const button of this.buttons()) {
      button.classList.remove("is-right", "is-wrong", "answer-hover");
      button.setAttribute("aria-disabled", "false");
      button.tabIndex =
        Number(button.dataset.piano) === this.focusMidi ? 0 : -1;
    }
    // Do not leave keyboard focus identifying the previous answer on the next card.
    if (hadFocus) this.buttons()[0]?.focus({ preventScroll: true });
  }
  setUnavailable(unavailable: boolean) {
    this.locked = unavailable;
    for (const button of this.buttons())
      button.setAttribute("aria-disabled", String(unavailable));
  }
  feedback(selected: number, correct: number) {
    this.locked = true;
    for (const button of this.buttons()) {
      const midi = Number(button.dataset.piano);
      button.setAttribute("aria-disabled", "true");
      button.classList.remove("answer-hover");
      button.classList.toggle("is-right", midi === correct);
      button.classList.toggle(
        "is-wrong",
        midi === selected && selected !== correct,
      );
    }
  }
}
