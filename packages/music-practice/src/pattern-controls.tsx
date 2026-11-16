import { PracticeAction, PracticeActions } from "@ldayton/ui/practice-actions";
import { useSyncExternalStore } from "react";
import { createViewState } from "./view-state";
export const patternControlsState = createViewState<{ paused: boolean }>;
export function PatternControls({
  model,
  pause,
  restart,
  next,
}: {
  model: ReturnType<typeof patternControlsState>;
  pause(): void;
  restart(): void;
  next(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <PracticeActions wrap="nowrap">
      <PracticeAction
        className="pattern-again"
        label="Start again"
        icon="restart"
        onClick={restart}
      />
      <PracticeAction
        className="pattern-pause"
        label={state.paused ? "Resume" : "Pause"}
        icon={state.paused ? "play" : "pause"}
        variant="filled"
        onClick={pause}
      />
      <PracticeAction
        className="pattern-next"
        label="New pattern"
        icon="chevron-right"
        onClick={next}
      />
    </PracticeActions>
  );
}
