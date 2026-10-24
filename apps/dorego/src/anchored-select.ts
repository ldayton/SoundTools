export class AnchoredSelect {
  private menu: HTMLDivElement;
  constructor(
    private select: HTMLSelectElement,
    private trigger: HTMLButtonElement
  ) {
    this.menu = document.createElement('div');
    this.menu.id = `${select.id}-menu`;
    this.menu.className = 'anchored-menu';
    this.menu.setAttribute('popover', 'auto');
    this.menu.setAttribute('role', 'listbox');
    this.menu.setAttribute('aria-label', select.getAttribute('aria-label') || 'Options');
    for (const option of select.options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.dataset.value = option.value;
      button.textContent = option.textContent;
      this.menu.append(button);
    }
    document.body.append(this.menu);
    trigger.setAttribute('aria-controls', this.menu.id);
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', () =>
      this.menu.matches(':popover-open') ? this.close() : this.open()
    );
    trigger.addEventListener('keydown', (event) => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        this.open();
      }
    });
    this.menu.addEventListener('toggle', () =>
      trigger.setAttribute('aria-expanded', String(this.menu.matches(':popover-open')))
    );
    this.menu.addEventListener('click', (event) => {
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-value]');
      if (!option) return;
      select.value = option.dataset.value!;
      this.close();
      select.dispatchEvent(new Event('change', { bubbles: true }));
      trigger.focus({ preventScroll: true });
    });
    this.menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
        trigger.focus({ preventScroll: true });
        return;
      }
      const options = [...this.menu.querySelectorAll<HTMLButtonElement>('[data-value]')];
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      let next = index;
      if (event.key === 'ArrowDown') next = (index + 1) % options.length;
      else if (event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = options.length - 1;
      else return;
      event.preventDefault();
      options.forEach((option, i) => (option.tabIndex = i === next ? 0 : -1));
      options[next].focus();
    });
    window.addEventListener('resize', () => this.close());
    window.addEventListener(
      'scroll',
      (event) => {
        if (event.target !== this.menu) this.close();
      },
      true
    );
  }
  sync() {
    this.trigger.querySelector('span')!.textContent =
      this.select.selectedOptions[0]?.textContent || '';
    for (const option of this.menu.querySelectorAll<HTMLButtonElement>('[data-value]')) {
      const selected = option.dataset.value === this.select.value;
      option.setAttribute('aria-selected', String(selected));
      option.tabIndex = selected ? 0 : -1;
    }
  }
  private open() {
    this.sync();
    if (!this.menu.matches(':popover-open')) this.menu.showPopover();
    const anchor = this.trigger.getBoundingClientRect();
    this.menu.style.width = `${anchor.width}px`;
    const height = this.menu.getBoundingClientRect().height;
    const below = anchor.bottom + 6;
    this.menu.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - anchor.width - 8))}px`;
    this.menu.style.top = `${Math.max(8, below + height <= innerHeight - 8 ? below : anchor.top - height - 6)}px`;
    this.menu
      .querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true });
  }
  private close() {
    if (this.menu.matches(':popover-open')) this.menu.hidePopover();
  }
}
