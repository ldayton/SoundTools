import "./note-wheel.css";

const ROW = 32;

export class NoteWheel {
  private value: number;
  private minimum: number;
  private maximum: number;
  private observer: ResizeObserver;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private drag: { y: number; top: number; selected: number | null } | null =
    null;
  constructor(
    private element: HTMLElement,
    private commit: (midi: number) => void,
    private options: {
      low: number;
      high: number;
      label(value: number): string;
      keyboard?: boolean;
    },
  ) {
    this.value = options.low;
    this.minimum = options.low;
    this.maximum = options.high;
    element.innerHTML = Array.from(
      { length: this.options.high - this.options.low + 1 },
      (_, i) =>
        `<span class="note-wheel-item" data-midi="${i + this.options.low}" aria-hidden="true"><span class="note-wheel-primary">${this.options.label(i + this.options.low)}</span></span>`,
    ).join("");
    if (options.keyboard)
      element.addEventListener("keydown", (event) => {
        const steps: Record<string, number> = {
          ArrowUp: 1,
          ArrowDown: -1,
          PageUp: 12,
          PageDown: -12,
        };
        if (!(event.key in steps) && !["Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const value =
          event.key === "Home"
            ? options.low
            : event.key === "End"
              ? options.high
              : Math.max(
                  options.low,
                  Math.min(options.high, this.value + steps[event.key]),
                );
        this.setValue(value);
        this.commit(value);
      });
    this.observer = new ResizeObserver(() => {
      if (element.getClientRects().length) this.setValue(this.value);
    });
    this.observer.observe(element);
    element.addEventListener("scroll", () => {
      this.highlight(this.nearest());
      clearTimeout(this.timer);
      if (!this.drag) this.timer = setTimeout(() => this.settle(), 140);
    });
    element.addEventListener("scrollend", () => {
      if (!this.drag) this.settle();
    });
    element.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      event.preventDefault();
      element.focus({ preventScroll: true });
      const item = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-midi]",
      );
      this.drag = {
        y: event.clientY,
        top: element.scrollTop,
        selected: item ? Number(item.dataset.midi) : null,
      };
      clearTimeout(this.timer);
      element.style.scrollSnapType = "none";
      element.setPointerCapture(event.pointerId);
      element.classList.add("is-dragging");
    });
    element.addEventListener("pointermove", (event) => {
      if (this.drag)
        element.scrollTop = this.drag.top + this.drag.y - event.clientY;
    });
    const release = (event: PointerEvent) => {
      if (!this.drag) return;
      const selected =
        Math.abs(event.clientY - this.drag.y) < 4 ? this.drag.selected : null;
      this.drag = null;
      element.classList.remove("is-dragging");
      element.style.scrollSnapType = "";
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      const midi = Math.max(
        this.minimum,
        Math.min(this.maximum, selected ?? this.nearest()),
      );
      element.scrollTo({
        top: (midi - this.options.low) * ROW,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      this.timer = setTimeout(() => this.settle(), 160);
    };
    element.addEventListener("pointerup", release);
    element.addEventListener("pointercancel", release);
  }
  private nearest() {
    return Math.max(
      this.minimum,
      Math.min(
        this.maximum,
        this.options.low + Math.round(this.element.scrollTop / ROW),
      ),
    );
  }
  private highlight(midi: number) {
    for (const item of this.element.children)
      item.classList.toggle(
        "is-selected",
        Number((item as HTMLElement).dataset.midi) === midi,
      );
    this.element.setAttribute("aria-valuenow", String(midi));
    this.element.setAttribute("aria-valuetext", this.options.label(midi));
  }
  private settle() {
    clearTimeout(this.timer);
    if (!this.element.getClientRects().length) return;
    const midi = this.nearest();
    if (midi === this.value) {
      const raw = this.options.low + Math.round(this.element.scrollTop / ROW);
      if (raw < this.minimum || raw > this.maximum) this.setValue(midi);
      return;
    }
    this.value = midi;
    this.commit(midi);
  }
  setLimits(minimum: number, maximum: number) {
    this.minimum = Math.max(this.options.low, minimum);
    this.maximum = Math.min(this.options.high, maximum);
    for (const child of this.element.children) {
      const value = Number((child as HTMLElement).dataset.midi);
      child.classList.toggle(
        "is-unavailable",
        value < this.minimum || value > this.maximum,
      );
    }
  }
  destroy() {
    clearTimeout(this.timer);
    this.observer.disconnect();
  }
  setValue(midi: number) {
    clearTimeout(this.timer);
    this.value = midi;
    this.highlight(midi);
    this.element.scrollTop = (midi - this.options.low) * ROW;
  }
}
