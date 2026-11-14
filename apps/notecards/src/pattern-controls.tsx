import { useSyncExternalStore } from "react";
import { Button, Group } from "@mantine/core";
import { createViewState } from "./view-state";
import { PracticePianoToggle } from "./piano-presentation";
export const patternControlsState = createViewState<{ paused: boolean }>;
export function PatternControls({
  model,
  panelId,
  pause,
  restart,
  next,
}: {
  model: ReturnType<typeof patternControlsState>;
  panelId: string;
  pause(): void;
  restart(): void;
  next(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Group gap="xs" className="soundtools-ui">
      <Button className="pattern-pause" variant="filled" onClick={pause}>
        {state.paused ? "Resume" : "Pause"}
      </Button>
      <Button className="pattern-again" variant="default" onClick={restart}>
        Start again
      </Button>
      <Button className="pattern-next" variant="default" onClick={next}>
        New pattern →
      </Button>
      <PracticePianoToggle panelId={panelId} />
    </Group>
  );
}
