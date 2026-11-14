import { createViewState } from "./view-state";
/** Offline UI snapshot. The service owns the state; views subscribe without owning its lifecycle. */
export type OfflineState = {
  status: string;
  ready: boolean;
  retryVisible: boolean;
  busy: boolean;
  updateAvailable: boolean;
};
const initial: OfflineState = {
  status: "Saving for offline use…",
  ready: false,
  retryVisible: false,
  busy: false,
  updateAvailable: false,
};
const model = createViewState(initial);
export const offlineState = {
  getSnapshot: model.getSnapshot,
  subscribe: model.subscribe,
  set(patch: Partial<OfflineState>) {
    model.set({ ...model.getSnapshot(), ...patch });
  },
};
export const offlineActions = { retry: () => {}, update: () => {} };
