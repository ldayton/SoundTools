import { playPianoNote, preparePianoSound } from "./piano-audio";
import { visiblePianoLayout } from "./piano-layout";
import { isBlack, keyLabel } from "./piano-model";
/** Native buttons preserve precise hit testing, focus, and screen-reader access. */
export class Piano {
  private locked = false;
  private signature = "";
  private focusMidi = 60;
  private request?: [number, number, boolean];
  private marked?: [number, number];
  visibleBounds: [number, number] = [60, 83];
  contains(midi: number) {
    return this.buttons().some((b) => Number(b.dataset.piano) === midi);
  }
  constructor(
    private element: HTMLElement,
    private answer: (midi: number) => void,
    private rangeChanged: () => void = () => {},
  ) {
    new ResizeObserver(() => requestAnimationFrame(() => this.draw())).observe(
      element,
    );
    element.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-piano]",
      );
      if (button && !this.locked) {
        const note = Number(button.dataset.piano);
        void playPianoNote(note);
        this.answer(note);
      }
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
    this.request = [low, high, named];
    this.locked = false;
    this.marked = undefined;
    this.draw();
    this.focusMidi = this.visibleBounds[0];
    for (const b of this.buttons()) {
      b.classList.remove("is-right", "is-wrong", "answer-hover");
      b.setAttribute("aria-disabled", "false");
      b.tabIndex = Number(b.dataset.piano) === this.focusMidi ? 0 : -1;
    }
    this.rangeChanged();
    if (hadFocus)
      this.buttons()
        .find((b) => Number(b.dataset.piano) === this.focusMidi)
        ?.focus({ preventScroll: true });
  }
  private draw() {
    if (!this.request) return;
    const style = getComputedStyle(this.element);
    const width =
      this.element.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    if (width <= 0) return;
    preparePianoSound();
    const [requestedLow, requestedHigh, named] = this.request;
    const layout = visiblePianoLayout(
      width,
      requestedLow,
      requestedHigh,
      named,
      matchMedia("(max-width: 600px)").matches,
    );
    const { low, high, rows: ranges, whiteWidth } = layout;
    const signature = JSON.stringify(layout) + named;
    if (signature === this.signature) return;
    const hadFocus = this.element.contains(document.activeElement);
    const selected = this.buttons()
      .filter((b) => b.classList.contains("sight-key-selected"))
      .map((b) => b.dataset.piano);
    this.signature = signature;
    this.visibleBounds = [low, high];
    {
      const rows: string[] = [];
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
            return `<button type="button" class="piano-key ${black ? "black-key" : "white-key"}" data-piano="${midi}" aria-label="${keyLabel(midi, !named)}" tabindex="-1" style="${position}">${midi % 12 === 0 ? `<span class="piano-landmark">C${Math.floor(midi / 12) - 1}</span>` : ""}</button>`;
          })
          .join("");
        rows.push(
          `<div class="piano-octave" style="--whites:${whites.length};--white:${whiteWidth}px;width:${whites.length * whiteWidth}px"><div class="piano-keys">${keys}</div></div>`,
        );
      }
      this.element.innerHTML = `<div class="piano-layout ${named ? "piano-named" : "piano-staff"}" role="group" aria-label="Piano answer keys">${rows.join("")}</div>`;
    }
    if (!this.contains(this.focusMidi)) this.focusMidi = low;
    this.setUnavailable(this.locked);
    for (const b of this.buttons())
      b.tabIndex = Number(b.dataset.piano) === this.focusMidi ? 0 : -1;
    for (const b of this.buttons())
      b.classList.toggle(
        "sight-key-selected",
        selected.includes(b.dataset.piano),
      );
    if (this.marked) this.feedback(...this.marked);
    if (hadFocus)
      this.buttons()
        .find((b) => Number(b.dataset.piano) === this.focusMidi)
        ?.focus({ preventScroll: true });
    this.rangeChanged();
  }
  setUnavailable(unavailable: boolean) {
    this.locked = unavailable;
    for (const button of this.buttons())
      button.setAttribute("aria-disabled", String(unavailable));
  }
  feedback(selected: number, correct: number) {
    this.locked = true;
    this.marked = [selected, correct];
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
