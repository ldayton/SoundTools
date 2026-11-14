import {
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  PracticeOptionsProvider as SharedProvider,
  type OptionsEntry,
} from "@ldayton/ui/practice-workspace";
export {
  PracticeWorkspace,
  PracticeOptionsReopen,
} from "@ldayton/ui/practice-workspace";
let entries: readonly OptionsEntry[] = [];
const listeners = new Set<() => void>();
const registry = {
  getSnapshot: () => entries,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
export function registerPracticeOptions(id: string, form: ReactNode) {
  entries = [...entries.filter((entry) => entry.id !== id), { id, form }];
  listeners.forEach((listener) => listener());
}
export function PracticeOptionsProvider({
  activeId,
  activityKey,
  children,
}: PropsWithChildren<{ activeId?: string; activityKey?: string }>) {
  const entries = useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
  );
  return (
    <SharedProvider
      entries={entries}
      activeId={activeId}
      activityKey={activityKey}
    >
      {children}
    </SharedProvider>
  );
}
