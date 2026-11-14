import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";

type View = { target: HTMLElement; content: ReactNode };
type Options = { id: string; form: ReactNode };
type Snapshot = {
  views: readonly View[];
  options: readonly Options[];
  selection: ReactNode;
};
const owners = new WeakMap<
  HTMLElement,
  ReturnType<typeof createPracticeRegistry>
>();

/** One application's React views; controllers address only their bound activity host. */
export function createPracticeRegistry() {
  let snapshot: Snapshot = { views: [], options: [], selection: null };
  const listeners = new Set<() => void>();
  function update(patch: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...patch };
    // Controllers measure renderer hosts immediately after mounting a view.
    flushSync(() => listeners.forEach((listener) => listener()));
  }
  const registry = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    bind(element: HTMLElement) {
      owners.set(element, registry);
    },
    view(target: HTMLElement, content: ReactNode) {
      if (!snapshot.views.some((view) => view.target === target))
        target.replaceChildren();
      update({
        views: [
          ...snapshot.views.filter((view) => view.target !== target),
          { target, content },
        ],
      });
    },
    options(element: HTMLElement, form: ReactNode) {
      update({
        options: [
          ...snapshot.options.filter((entry) => entry.id !== element.id),
          { id: element.id, form },
        ],
      });
    },
    selection(content: ReactNode) {
      update({ selection: content });
    },
  };
  return registry;
}
function owner(element: HTMLElement) {
  const registry = owners.get(element);
  if (!registry) throw Error(`No React practice host for ${element.id}`);
  return registry;
}
export function mountPracticeSurface(element: HTMLElement, content: ReactNode) {
  owner(element).view(element, content);
}
export function registerPracticeOptions(
  element: HTMLElement,
  content: ReactNode,
) {
  owner(element).options(element, content);
}
export function setSidebarSelection(element: HTMLElement, content: ReactNode) {
  owner(element).selection(content);
}
export function PracticeSurfaceViews({
  registry,
}: {
  registry: ReturnType<typeof createPracticeRegistry>;
}) {
  const snapshot = useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
  );
  return snapshot.views.map((view) =>
    createPortal(view.content, view.target, view.target.id),
  );
}
