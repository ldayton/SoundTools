import { noteName } from './music';

const ROW = 32;
const LOW = 24;
const HIGH = 96;

export class NoteWheel {
  private value = LOW;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private drag: { y: number; top: number; selected: number | null } | null = null;
  constructor(
    private element: HTMLElement,
    private commit: (midi: number) => void
  ) {
    element.innerHTML = Array.from(
      { length: HIGH - LOW + 1 },
      (_, i) =>
        `<span class="note-wheel-item" data-midi="${i + LOW}" aria-hidden="true">${noteName(i + LOW)}</span>`
    ).join('');
    element.addEventListener('scroll', () => {
      this.highlight(this.nearest());
      clearTimeout(this.timer);
      if (!this.drag) this.timer = setTimeout(() => this.settle(), 140);
    });
    element.addEventListener('scrollend', () => {
      if (!this.drag) this.settle();
    });
    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      event.preventDefault();
      element.focus({ preventScroll: true });
      const item = (event.target as HTMLElement).closest<HTMLElement>('[data-midi]');
      this.drag = {
        y: event.clientY,
        top: element.scrollTop,
        selected: item ? Number(item.dataset.midi) : null,
      };
      clearTimeout(this.timer);
      element.style.scrollSnapType = 'none';
      element.setPointerCapture(event.pointerId);
      element.classList.add('is-dragging');
    });
    element.addEventListener('pointermove', (event) => {
      if (this.drag) element.scrollTop = this.drag.top + this.drag.y - event.clientY;
    });
    const release = (event: PointerEvent) => {
      if (!this.drag) return;
      const selected = Math.abs(event.clientY - this.drag.y) < 4 ? this.drag.selected : null;
      this.drag = null;
      element.classList.remove('is-dragging');
      element.style.scrollSnapType = '';
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      const midi = selected ?? this.nearest();
      element.scrollTo({
        top: (midi - LOW) * ROW,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      this.timer = setTimeout(() => this.settle(), 160);
    };
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
  }
  private nearest() {
    return Math.max(LOW, Math.min(HIGH, LOW + Math.round(this.element.scrollTop / ROW)));
  }
  private highlight(midi: number) {
    for (const item of this.element.children)
      item.classList.toggle('is-selected', Number((item as HTMLElement).dataset.midi) === midi);
    this.element.setAttribute('aria-valuenow', String(midi));
    this.element.setAttribute('aria-valuetext', noteName(midi));
  }
  private settle() {
    clearTimeout(this.timer);
    if (!this.element.getClientRects().length) return;
    const midi = this.nearest();
    if (midi === this.value) return;
    this.value = midi;
    this.commit(midi);
  }
  setValue(midi: number) {
    clearTimeout(this.timer);
    this.value = midi;
    this.highlight(midi);
    this.element.scrollTop = (midi - LOW) * ROW;
  }
}
