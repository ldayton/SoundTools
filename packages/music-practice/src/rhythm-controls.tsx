import { TempoControl } from "@ldayton/ui/tempo-control";
import { RHYTHM_TEMPO_LIMITS } from "./rhythm-model";
import { PracticeAction, PracticeActions } from "@ldayton/ui/practice-actions";
import { useSyncExternalStore } from "react";
import { Button, Group, Stack } from "@mantine/core";
import { createViewState } from "./view-state";
export const rhythmControlsState = createViewState<{
  phase: "ready" | "countin" | "playing" | "complete";
  response: string;
  bpm: number;
  feedback?: string;
}>;
export type RhythmControlsState = ReturnType<typeof rhythmControlsState>;
export function RhythmControls({
  model,
  start,
  next,
  tempo,
}: {
  model: RhythmControlsState;
  start(): void;
  next(): void;
  tempo(bpm: number): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <PracticeActions>
      <TempoControl
        id="rhythm-tempo"
        compact
        value={state.bpm}
        min={RHYTHM_TEMPO_LIMITS.min}
        max={RHYTHM_TEMPO_LIMITS.max}
        onChange={tempo}
      />
      <PracticeAction
        className="rhythm-start"
        variant="filled"
        onClick={start}
        label={
          ["countin", "playing"].includes(state.phase)
            ? "Stop"
            : state.phase === "complete"
              ? "Start again"
              : "Start"
        }
        icon={["countin", "playing"].includes(state.phase) ? "stop" : "play"}
      />
      <PracticeAction
        className="rhythm-new"
        label="New rhythm"
        icon="refresh"
        onClick={next}
      />
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
