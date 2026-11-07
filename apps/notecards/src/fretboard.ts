import {
  STRINGS,
  locationLabel,
  type GuitarCard,
  type Profile,
} from "./guitar";
export class Fretboard {
  private start = 0;
  private selected: number | null = null;
  private correct: number[] = [];
  private locked = false;
  private card!: GuitarCard;
  private profile!: Profile;
  private interactive = false;
  private focusFret = 0;
  constructor(
    private element: HTMLElement,
    private answer: (string: number, fret: number) => void,
  ) {
    element.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button",
      );
      if (!button) return;
      if (button.dataset.window) {
        this.start = Number(button.dataset.window);
        this.render();
        return;
      }
      if (button.dataset.fret !== undefined && this.interactive && !this.locked)
        this.answer(this.card.string, Number(button.dataset.fret));
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
        if (this.focusFret < this.start) this.start = this.focusFret;
        if (this.focusFret > this.start + 5) this.start = this.focusFret - 5;
        this.render();
        this.element
          .querySelector<HTMLButtonElement>(`[data-fret="${this.focusFret}"]`)
          ?.focus({ preventScroll: true });
      }
    });
  }
  focusAnswer() {
    this.element
      .querySelector<HTMLButtonElement>(
        '[data-fret][tabindex="0"]:not(:disabled)',
      )
      ?.focus({ preventScroll: true });
  }
  show(card: GuitarCard, profile: Profile, interactive: boolean) {
    this.card = card;
    this.profile = profile;
    this.interactive = interactive;
    this.locked = false;
    this.selected = null;
    this.correct = [];
    this.start = interactive
      ? profile.minFret
      : Math.max(profile.minFret, Math.min(card.fret - 2, profile.maxFret - 5));
    this.focusFret = profile.minFret;
    this.render();
  }
  feedback(selected: number, correct: number[]) {
    this.locked = true;
    this.selected = selected;
    this.correct = correct;
    // Show the correction even if it lies in another fret window.
    if (
      correct.length &&
      !correct.some((fret) => this.visible().includes(fret))
    )
      this.start = Math.max(
        this.profile.minFret,
        Math.min(correct[0], this.profile.maxFret - 5),
      );
    this.render();
  }
  private visible() {
    const end = Math.min(this.profile.maxFret, this.start + 5);
    return Array.from(
      { length: end - this.start + 1 },
      (_, i) => this.start + i,
    );
  }
  private render() {
    const frets = this.visible(),
      columns = frets.length;
    const windowControls =
      this.interactive && this.profile.maxFret - this.profile.minFret > 5;
    const eligible = this.interactive
      ? `String ${this.card.string}`
      : "Name the highlighted note";
    this.element.innerHTML = `<div class="board-toolbar"><span>${eligible}</span>${windowControls ? `<div class="window-controls"><button data-window="${Math.max(this.profile.minFret, this.start - 5)}" aria-label="Lower frets" ${this.start <= this.profile.minFret ? "disabled" : ""}>←</button><span>${frets[0]}–${frets.at(-1)}</span><button data-window="${Math.min(this.profile.maxFret - 5, this.start + 5)}" aria-label="Higher frets" ${frets.at(-1)! >= this.profile.maxFret ? "disabled" : ""}>→</button></div>` : ""}</div>
    <div class="fret-labels" style="--columns:${columns}"><span></span>${frets.map((f) => `<span>${f === 0 ? "Open" : f}</span>`).join("")}</div>
    <div class="board-frame"><div class="string-labels">${STRINGS.map((s) => `<span>${s.number}</span>`).join("")}</div>
    <div class="board-cells" style="--columns:${columns}"><svg class="board-lines" viewBox="0 0 ${columns * 50} 264" preserveAspectRatio="none" aria-hidden="true">${STRINGS.map((s) => `<line x1="0" x2="${columns * 50}" y1="${(s.number - 0.5) * 44}" y2="${(s.number - 0.5) * 44}" stroke-width="${0.6 + s.number * 0.25}"/>`).join("")}${frets.map((f, i) => `<line class="fret-wire" x1="${(i + 1) * 50}" x2="${(i + 1) * 50}" y1="0" y2="264" stroke-width="${f === 0 ? 5 : 1}"/>`).join("")}</svg>
    ${STRINGS.map((s) =>
      frets
        .map((f) => {
          const target = s.number === this.card.string;
          const highlight = !this.interactive && target && f === this.card.fret;
          const right = this.locked && target && this.correct.includes(f),
            wrong = this.locked && target && f === this.selected && !right;
          const cls = `fret-cell ${highlight ? "is-target" : ""} ${right ? "is-right" : ""} ${wrong ? "is-wrong" : ""} ${this.interactive && !target ? "is-muted" : ""}`;
          return this.interactive && target
            ? `<button class="${cls}" data-fret="${f}" data-string="${s.number}" aria-label="${locationLabel(s.number, f)}" tabindex="${f === Math.max(frets[0], Math.min(frets.at(-1)!, this.focusFret)) ? 0 : -1}" ${this.locked ? "disabled" : ""}><span>${right ? "✓" : wrong ? "×" : ""}</span></button>`
            : `<div class="${cls}" ${highlight ? `role="img" aria-label="Highlighted: ${locationLabel(s.number, f)}"` : 'aria-hidden="true"'}><span>${highlight ? "●" : ""}</span></div>`;
        })
        .join(""),
    ).join("")}</div></div>
    <div class="fret-markers" style="--columns:${columns}"><span></span>${frets.map((f) => `<span>${[3, 5, 7, 9].includes(f) ? "•" : f === 12 ? "••" : ""}</span>`).join("")}</div>`;
  }
}
