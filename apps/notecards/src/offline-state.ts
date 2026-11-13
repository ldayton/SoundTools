/** Offline UI snapshot. The service owns the state; views subscribe without owning its lifecycle. */
export type OfflineState = {
  status: string;
  ready: boolean;
  retryVisible: boolean;
  busy: boolean;
  updateAvailable: boolean;
};
let state: OfflineState = {
  status: "Saving for offline use…",
  ready: false,
  retryVisible: false,
  busy: false,
  updateAvailable: false,
};
const listeners = new Set<() => void>();
export const offlineState = {
  getSnapshot: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set(change: Partial<OfflineState>) {
    state = { ...state, ...change };
    listeners.forEach((listener) => listener());
  },
};
export const offlineActions = { retry: () => {}, update: () => {} };
