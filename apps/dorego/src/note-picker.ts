import { noteName } from './music';

export function parseNote(value: string): number | null {
  const match = /^\s*([a-g])([#♯b♭]?)([1-7])\s*$/i.exec(value);
  if (!match) return null;
  const pitches: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pitch = pitches[match[1].toUpperCase()];
  const accidental = ['#', '♯'].includes(match[2]) ? 1 : ['b', '♭'].includes(match[2]) ? -1 : 0;
  const midi = (Number(match[3]) + 1) * 12 + pitch + accidental;
  return midi >= 24 && midi <= 96 ? midi : null;
}

export class NotePicker {
  private value = 24;
  private popover: HTMLDivElement;
  constructor(
    private input: HTMLInputElement,
    private button: HTMLButtonElement,
    private commit: (midi: number) => void
  ) {
    const title = input.getAttribute('aria-label')!;
    input.readOnly = true;
    this.popover = document.createElement('div');
    this.popover.id = `${input.id}-picker`;
    this.popover.className = 'note-picker';
    this.popover.setAttribute('popover', 'auto');
    this.popover.setAttribute('role', 'dialog');
    this.popover.setAttribute('aria-label', `Choose ${title.toLowerCase()}`);
    this.popover.innerHTML = `<div class="note-picker-title">${title}</div><div class="note-picker-grid" role="group" aria-label="Notes by octave">${Array.from(
      { length: 7 },
      (_, row) =>
        `<span class="note-picker-octave" aria-hidden="true">${row + 1}</span>${Array.from(
          { length: 12 },
          (_, pitch) => {
            const midi = 24 + row * 12 + pitch;
            return midi <= 96
              ? `<button type="button" data-midi="${midi}" tabindex="-1" aria-label="${noteName(midi)}">${noteName(midi)}</button>`
              : '<span></span>';
          }
        ).join('')}`
    ).join('')}</div>`;
    document.body.append(this.popover);
    for (const element of [input, button]) {
      element.setAttribute('aria-controls', this.popover.id);
      element.setAttribute('aria-expanded', 'false');
      element.setAttribute('aria-haspopup', 'dialog');
    }
    input.parentElement!.addEventListener('click', () => this.toggle());
    this.popover.addEventListener('toggle', () => {
      const open = this.popover.matches(':popover-open');
      input.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-expanded', String(open));
    });
    this.popover.addEventListener('click', (event) => {
      const selected = (event.target as HTMLElement).closest<HTMLElement>('[data-midi]');
      if (!selected) return;
      this.commit(Number(selected.dataset.midi));
      this.close();
      input.focus({ preventScroll: true });
    });
    this.popover.addEventListener('keydown', (event) => {
      const selected = (event.target as HTMLElement).closest<HTMLElement>('[data-midi]');
      if (!selected) return;
      const steps: Record<string, number> = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowUp: -12,
        ArrowDown: 12,
      };
      if (!(event.key in steps)) return;
      event.preventDefault();
      const midi = Math.max(24, Math.min(96, Number(selected.dataset.midi) + steps[event.key]));
      selected.tabIndex = -1;
      const next = this.popover.querySelector<HTMLButtonElement>(`[data-midi="${midi}"]`)!;
      next.tabIndex = 0;
      next.focus();
    });
    input.addEventListener('keydown', (event) => {
      if ((event.altKey && event.key === 'ArrowDown') || event.key === 'F4') {
        event.preventDefault();
        this.toggle();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.toggle();
        return;
      }
      if (event.key === 'Escape') {
        input.value = noteName(this.value);
        input.setCustomValidity('');
        input.removeAttribute('aria-invalid');
        return;
      }
      const steps: Record<string, number> = {
        ArrowUp: 1,
        ArrowDown: -1,
        PageUp: 12,
        PageDown: -12,
      };
      if (event.key in steps) {
        event.preventDefault();
        this.commit(Math.max(24, Math.min(96, this.value + steps[event.key])));
      }
    });
    window.addEventListener('resize', () => this.close());
  }
  private toggle() {
    if (this.popover.matches(':popover-open')) {
      this.close();
      return;
    }
    this.popover.showPopover();
    const anchor = this.input.parentElement!.getBoundingClientRect();
    const box = this.popover.getBoundingClientRect();
    this.popover.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - box.width - 12))}px`;
    this.popover.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, innerHeight - box.height - 12))}px`;
    this.popover
      .querySelector<HTMLButtonElement>(`[data-midi="${this.value}"]`)!
      .focus({ preventScroll: true });
  }
  close() {
    if (this.popover.matches(':popover-open')) this.popover.hidePopover();
  }
  setValue(midi: number) {
    this.value = midi;
    this.input.value = noteName(midi);
    this.input.setCustomValidity('');
    this.input.removeAttribute('aria-invalid');
    for (const button of this.popover.querySelectorAll<HTMLButtonElement>('[data-midi]')) {
      const selected = Number(button.dataset.midi) === midi;
      button.setAttribute('aria-pressed', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  }
}
