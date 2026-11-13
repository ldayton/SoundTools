import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

type View = { target: HTMLElement; content: ReactNode };
let views: readonly View[] = [];
const listeners = new Set<() => void>();
const store = {
  getSnapshot: () => views,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
/** React controls embedded in cached music surfaces, sharing the application's one root/provider. */
export function mountPracticeControls(target: HTMLElement, content: ReactNode) {
  const index = views.findIndex((view) => view.target === target);
  views =
    index < 0
      ? [...views, { target, content }]
      : views.map((view, i) => (i === index ? { target, content } : view));
  listeners.forEach((listener) => listener());
}
export function PracticeSurfaceViews() {
  const current = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return current.map((view, index) =>
    createPortal(view.content, view.target, String(index)),
  );
}
