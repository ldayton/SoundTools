/** Small serializable view snapshots. Keep one stable snapshot until its data changes. */
export function createViewState<T>(initial: T) {
  let state = initial;
  let signature = JSON.stringify(state);
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: T) {
      const nextSignature = JSON.stringify(next);
      if (nextSignature === signature) return;
      state = next;
      signature = nextSignature;
      listeners.forEach((listener) => listener());
    },
  };
}
