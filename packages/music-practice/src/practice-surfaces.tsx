import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";

type View = { target: HTMLElement; content: ReactNode };
type Options = { id: string; form: ReactNode; title?: string };
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
  let snapshot: Snapshot = {
    views: [],
    options: [],
    selection: null,
  };
  const listeners = new Set<() => void>();
  const hosts = new Set<HTMLElement>();
  let selectionOwner: HTMLElement | undefined;
  function update(patch: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...patch };
    // Controllers measure renderer hosts immediately after mounting a view.
    flushSync(() => listeners.forEach((listener) => listener()));
  }
  const headers = new Map<string, HTMLElement>();
  function headerFor(id: string) {
    let host = headers.get(id);
    if (!host) {
      host = document.createElement("div");
      host.className = "sequence-transport";
      host.dataset.activityToolbar = id;
      headers.set(id, host);
    }
    return host;
  }
  const registry = {
    headerFor,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    bind(element: HTMLElement) {
      owners.set(element, registry);
      hosts.add(element);
    },
    view(target: HTMLElement, content: ReactNode) {
      if (!snapshot.views.some((view) => view.target === target))
        target.replaceChildren();
      const view = { target, content };
      update({
        views: [
          ...snapshot.views.filter((entry) => entry.target !== target),
          view,
        ],
      });
      return () => {
        if (snapshot.views.includes(view)) registry.release(target);
      };
    },
    options(element: HTMLElement, form: ReactNode, title?: string) {
      update({
        options: [
          ...snapshot.options.filter((entry) => entry.id !== element.id),
          { id: element.id, form, title },
        ],
      });
    },
    optionsTitle(element: HTMLElement, title: string) {
      const entry = snapshot.options.find((entry) => entry.id === element.id);
      if (!entry || entry.title === title) return;
      update({
        options: snapshot.options.map((entry) =>
          entry.id === element.id ? { ...entry, title } : entry,
        ),
      });
    },
    release(element: HTMLElement) {
      update({
        views: snapshot.views.filter((view) => view.target !== element),
        options: snapshot.options.filter((entry) => entry.id !== element.id),
        ...(selectionOwner === element ? { selection: null } : {}),
      });
      if (selectionOwner === element) selectionOwner = undefined;
    },
    dispose() {
      update({ views: [], options: [], selection: null });
      for (const element of hosts)
        if (owners.get(element) === registry) owners.delete(element);
      hosts.clear();
      listeners.clear();
      headers.clear();
    },
    selection(element: HTMLElement, content: ReactNode) {
      selectionOwner = element;
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
  return owner(element).view(element, content);
}
export function practiceHeaderHost(element: HTMLElement) {
  return owner(element).headerFor(element.id);
}
export function registerPracticeOptions(
  element: HTMLElement,
  content: ReactNode,
  title?: string,
) {
  owner(element).options(element, content, title);
}
export function setPracticeOptionsTitle(element: HTMLElement, title: string) {
  owner(element).optionsTitle(element, title);
}
export function setSidebarSelection(element: HTMLElement, content: ReactNode) {
  owner(element).selection(element, content);
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
