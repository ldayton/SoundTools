/** Resources owned by one imperative renderer, independent of navigation pauses. */
export class RendererLifetime {
  private events = new AbortController();
  private cleanups = new Set<() => void>();
  get disposed() {
    return this.events.signal.aborted;
  }
  add(cleanup: () => void) {
    if (this.disposed) cleanup();
    else this.cleanups.add(cleanup);
  }
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ): void;
  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
  ): void;
  listen(target: EventTarget, type: string, listener: (event: any) => void) {
    if (!this.disposed)
      target.addEventListener(type, listener, { signal: this.events.signal });
  }
  observe(target: Element, changed: () => void) {
    if (this.disposed) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (this.disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!this.disposed) changed();
      });
    });
    observer.observe(target);
    this.add(() => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    });
  }
  dispose() {
    if (this.disposed) return;
    this.events.abort();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
  }
}
