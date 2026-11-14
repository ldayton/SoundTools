import { PracticeActions } from "@ldayton/ui/practice-actions";
import { useSyncExternalStore } from "react";
import { Button, Group, Stack } from "@mantine/core";
import { createViewState } from "./view-state";
export const rhythmControlsState = createViewState<{
  phase: "ready" | "countin" | "playing" | "complete";
  response: string;
  feedback?: string;
}>;
export type RhythmControlsState = ReturnType<typeof rhythmControlsState>;
export function RhythmControls({
  model,
  start,
  next,
}: {
  model: RhythmControlsState;
  start(): void;
  next(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <PracticeActions>
      <Button className="rhythm-start" variant="filled" onClick={start}>
        {["countin", "playing"].includes(state.phase)
          ? "Stop"
          : state.phase === "complete"
            ? "Start again"
            : "Start"}
      </Button>
      <Button className="rhythm-new" variant="default" onClick={next}>
        New rhythm
      </Button>
    </PracticeActions>
  );
}
export function RhythmTap({
  model,
  tap,
}: {
  model: RhythmControlsState;
  tap(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Button
      className="rhythm-tap soundtools-ui"
      size="xl"
      fullWidth
      variant="filled"
      aria-label="Tap rhythm"
      data-feedback={state.feedback}
      onPointerDown={(event) => {
        if (event.button === 0) {
          event.preventDefault();
          tap();
        }
      }}
      onClick={(event) => {
        if (event.detail === 0) tap();
      }}
      onKeyDown={(event) => {
        if ([" ", "Enter"].includes(event.key)) {
          event.preventDefault();
          if (!event.repeat) tap();
        }
      }}
    >
      <Stack gap={0}>
        <span>Tap</span>
        <span className="rhythm-tap-response" aria-live="polite">
          {state.response}
        </span>
      </Stack>
    </Button>
  );
}
