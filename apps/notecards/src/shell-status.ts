import { createViewState } from "./view-state";
/** Persistence owns validity; the shell renders its status without DOM writes. */
const model = createViewState({
  blocked: true,
  saved: "Opening saved practice…",
  error: "",
  notice: "",
});
export const shellStatus = {
  subscribe: model.subscribe,
  getSnapshot: model.getSnapshot,
  set(patch: Partial<ReturnType<typeof model.getSnapshot>>) {
    model.set({ ...model.getSnapshot(), ...patch });
  },
};
