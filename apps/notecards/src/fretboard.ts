import type { Profile } from "./exercise-settings";
import {
  STRINGS,
  locationLabel,
  type GuitarCard,
} from "./guitar";
export class Fretboard {
  private selected: number | null = null;
  private correct: number[] = [];
  private locked = false;
  private card!: GuitarCard;
  private profile!: Profile;
  private interactive = false;
  private focusFret = 0;
  constructor(
    private element: HTMLElement,
    private answer: (string: number, fret: number, keyboard: boolean) => void,
  ) {
    element.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button",
      );
      if (!button) return;
      if (button.dataset.fret !== undefined && this.interactive && !this.locked)
        this.answer(
          this.card.string,
          Number(button.dataset.fret),
          event.detail === 0,
        );
    });
    element.addEventListener("keydown", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-fret]",
      );
      if (!button || !this.interactive || this.locked) return;
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      const steps: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        Home: -99,
        End: 99,
      };
      if (event.key in steps) {
        event.preventDefault();
        event.stopPropagation();
        this.focusFret = Math.max(
          this.profile.minFret,
          Math.min(
            this.profile.maxFret,
            Number(button.dataset.fret) + steps[event.key],
          ),
        );
        for (const cell of this.element.querySelectorAll<HTMLButtonElement>(
          "[data-fret]",
        ))
          cell.tabIndex = Number(cell.dataset.fret) === this.focusFret ? 0 : -1;
        const cell = this.element.querySelector<HTMLButtonElement>(
          `[data-fret="${this.focusFret}"]`,
        );
        cell?.focus({ preventScroll: true });
        this.reveal(cell);
      }
    });
  }
  focusAnswer() {
    const cell = this.element.querySelector<HTMLButtonElement>(
      '[data-fret][tabindex="0"]:not(:disabled)',
    );
    cell?.focus({ preventScroll: true });
    this.reveal(cell);
  }
  show(card: GuitarCard, profile: Profile, interactive: boolean) {
    this.card = card;
    this.profile = profile;
    this.interactive = interactive;
    this.locked = false;
    this.selected = null;
    this.correct = [];
    this.focusFret = profile.minFret;
    this.render();
    if (!interactive) this.reveal(this.element.querySelector(".is-target"));
  }
  feedback(selected: number, correct: number[]) {
    this.locked = true;
    this.selected = selected;
    this.correct = correct;
    this.render();
    this.reveal(
      this.element.querySelector(
        `[data-fret="${correct.includes(selected) ? selected : correct[0]}"]`,
      ),
    );
  }
  private reveal(cell: Element | null) {
    const scroller = this.element.querySelector<HTMLElement>(".board-scroll");
    if (!scroller || !cell) return;
    const view = scroller.getBoundingClientRect(),
      box = cell.getBoundingClientRect();
    if (box.left < view.left + 30)
      scroller.scrollLeft -= view.left + 30 - box.left;
    else if (box.right > view.right)
      scroller.scrollLeft += box.right - view.right;
  }
  private visible() {
    return Array.from(
      { length: Math.max(5, this.profile.maxFret) + 1 },
      (_, i) => i,
    );
  }
  private render() {
    const frets = this.visible(),
      columns = frets.length;
    const eligible = this.interactive
      ? `String ${this.card.string}`
      : "Name the highlighted note";
    const previousScroll =
      this.element.querySelector(".board-scroll")?.scrollLeft || 0;
    this.element.innerHTML = `<div class="board-toolbar"><span>${eligible}</span>${columns > 6 ? '<span class="pan-hint">Scroll for higher frets →</span>' : ""}</div>
    <div class="board-scroll" tabindex="${columns > 6 ? "0" : "-1"}" aria-label="Fretboard, open through fret ${frets.at(-1)}"><div class="board-track" style="--columns:${columns}">
    <div class="fret-labels" style="--columns:${columns}"><span></span>${frets.map((f) => `<span>${f === 0 ? "Open" : f}</span>`).join("")}</div>
    <div class="board-frame"><div class="string-labels">${STRINGS.map((s) => `<span>${s.number}</span>`).join("")}</div>
    <div class="board-cells" style="--columns:${columns}"><svg class="board-lines" viewBox="0 0 ${columns * 50} 264" preserveAspectRatio="none" aria-hidden="true">${STRINGS.map((s) => `<line x1="0" x2="${columns * 50}" y1="${(s.number - 0.5) * 44}" y2="${(s.number - 0.5) * 44}" stroke-width="${0.6 + s.number * 0.25}"/>`).join("")}${frets.map((f, i) => `<line class="fret-wire" x1="${(i + 1) * 50}" x2="${(i + 1) * 50}" y1="0" y2="264" stroke-width="${f === 0 ? 5 : 1}"/>`).join("")}</svg>
    ${STRINGS.map((s) =>
      frets
        .map((f) => {
          const target = s.number === this.card.string;
          const inRange =
            f >= this.profile.minFret && f <= this.profile.maxFret;
          const highlight = !this.interactive && target && f === this.card.fret;
          const right = this.locked && target && this.correct.includes(f),
            wrong = this.locked && target && f === this.selected && !right;
          const cls = `fret-cell ${highlight ? "is-target" : ""} ${right ? "is-right" : ""} ${wrong ? "is-wrong" : ""} ${this.interactive && (!target || !inRange) ? "is-muted" : ""}`;
          return this.interactive && target
            ? `<button class="${cls}" data-fret="${f}" data-string="${s.number}" aria-label="${locationLabel(s.number, f)}" tabindex="${f === Math.max(frets[0], Math.min(frets.at(-1)!, this.focusFret)) ? 0 : -1}" ${this.locked || !inRange ? "disabled" : ""}><span>${right ? "✓" : wrong ? "×" : ""}</span></button>`
            : `<div class="${cls}" ${highlight ? `role="img" aria-label="Highlighted: ${locationLabel(s.number, f)}"` : 'aria-hidden="true"'}><span>${highlight ? "●" : ""}</span></div>`;
        })
        .join(""),
    ).join("")}</div></div>
    <div class="fret-markers" style="--columns:${columns}"><span></span>${frets.map((f) => `<span>${[3, 5, 7, 9].includes(f) ? "•" : f === 12 ? "••" : ""}</span>`).join("")}</div></div></div>`;
    this.element.querySelector<HTMLElement>(".board-scroll")!.scrollLeft =
      previousScroll;
  }
}
