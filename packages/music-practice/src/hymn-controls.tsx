import { PracticeActions } from "@ldayton/ui/practice-actions";
import { useSyncExternalStore } from "react";
import { Button, Checkbox, Group, Text } from "@mantine/core";
import { createViewState } from "./view-state";
import { PracticePianoToggle } from "./piano-presentation";
export const hymnControlsState = createViewState<{
  disabled: boolean;
  pauseDisabled: boolean;
  pause: string;
  restore: string;
  previous: boolean;
  next: boolean;
  nextLabel: string;
  selecting: boolean;
  selected: boolean;
  loop: boolean;
  status: string;
}>;
export type HymnControlsState = ReturnType<typeof hymnControlsState>;
export function HymnControls({
  model,
  panelId,
  pause,
  restart,
  restore,
  previous,
  next,
  cancel,
  clear,
  loop,
}: {
  model: HymnControlsState;
  panelId: string;
  pause(): void;
  restart(): void;
  restore(): void;
  previous(): void;
  next(): void;
  cancel(): void;
  clear(): void;
  loop(value: boolean): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <div className="soundtools-ui hymn-controls">
      <PracticeActions>
        <Button
          className="hymn-pause"
          variant="filled"
          disabled={state.disabled || state.pauseDisabled}
          onClick={pause}
        >
          {state.pause}
        </Button>
        <Button
          className="hymn-restart"
          variant="default"
          disabled={state.disabled}
          onClick={restart}
        >
          Start again
        </Button>
        <Button
          className="hymn-restore-legacy"
          variant="default"
          hidden={!state.restore}
          disabled={state.disabled}
          onClick={restore}
        >
          {state.restore}
        </Button>
        <Button
          className="hymn-prev"
          variant="default"
          aria-label="Previous section"
          hidden={!state.previous}
          disabled={state.disabled}
          onClick={previous}
        >
          ← Previous
        </Button>
        <Button
          className="hymn-next"
          variant="default"
          hidden={!state.next}
          disabled={state.disabled}
          onClick={next}
        >
          {state.nextLabel}
        </Button>
        <PracticePianoToggle
          panelId={panelId}
          className="hymn-keyboard-toggle"
          disabled={state.disabled}
        />
      </PracticeActions>
      <Group
        gap="xs"
        className="hymn-passage-controls"
        hidden={!state.selecting && !state.selected}
        mt="xs"
      >
        <Button
          className="hymn-cancel-passage"
          variant="default"
          hidden={!state.selecting}
          onClick={cancel}
        >
          Cancel selection
        </Button>
        <Button
          className="hymn-clear-passage"
          variant="default"
          hidden={!state.selected || state.selecting}
          onClick={clear}
        >
          Clear selection
        </Button>
        <Checkbox
          id="hymn-loop"
          className="hymn-loop"
          hidden={!state.selected || state.selecting}
          label="Loop"
          checked={state.loop}
          onChange={(event) => loop(event.currentTarget.checked)}
        />
        <Text size="sm" className="hymn-passage-status" role="status">
          {state.status}
        </Text>
      </Group>
    </div>
  );
}
