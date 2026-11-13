import { useSyncExternalStore } from "react";
import { Button } from "@mantine/core";
import { createViewState } from "./view-state";
import { persistence } from "./persistence";
export const pianoPresentation = createViewState({
  visible: true,
  available: {} as Record<string, boolean>,
});
const listeners = new Set<() => void>();
export function onPianoPresentationChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setPianoPresentation(visible: boolean, persist = false) {
  pianoPresentation.set({ ...pianoPresentation.getSnapshot(), visible });
  listeners.forEach((listener) => listener());
  if (persist)
    persistence.write("presentation", {
      ...persistence.read<object>("presentation"),
      version: 1,
      pianoVisible: visible,
    });
}
export function PracticePianoToggle({
  panelId,
  className = "",
}: {
  panelId: string;
  className?: string;
}) {
  const state = useSyncExternalStore(
    pianoPresentation.subscribe,
    pianoPresentation.getSnapshot,
  );
  return (
    <Button
      className={`piano-toggle soundtools-ui ${className}`}
      variant={state.visible ? "light" : "default"}
      hidden={!state.available[panelId]}
      aria-label="On-screen piano"
      aria-controls={panelId}
      aria-expanded={state.visible}
      title={`${state.visible ? "Hide" : "Show"} on-screen piano`}
      onClick={() => setPianoPresentation(!state.visible, true)}
      leftSection={
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M8 5v8m8-8v8M8 13v6m8-6v6" />
        </svg>
      }
    >
      Piano
    </Button>
  );
}
