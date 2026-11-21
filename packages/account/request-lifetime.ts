/** Abort this document's account requests before WebKit tears down its network
 * context. A restored bfcache document gets a fresh lifetime; a departing one
 * cannot start another request from a timer or auth callback. */
export class RequestLifetime {
  private controller = new AbortController();
  constructor(
    target: EventTarget | undefined = typeof window === "undefined"
      ? undefined
      : window,
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    const depart = () =>
      this.controller.abort(
        new DOMException("Document is leaving", "AbortError"),
      );
    target?.addEventListener("beforeunload", depart);
    target?.addEventListener("pagehide", depart);
    target?.addEventListener("pageshow", () => {
      if (this.controller.signal.aborted)
        this.controller = new AbortController();
    });
  }
  async fetch(input: RequestInfo | URL, init?: RequestInit) {
    const signal = AbortSignal.any([
      this.controller.signal,
      AbortSignal.timeout(12000),
      ...(init?.signal ? [init.signal] : []),
      ...(input instanceof Request ? [input.signal] : []),
    ]);
    signal.throwIfAborted();
    return this.request(input, { ...init, signal });
  }
}
