import { useSyncExternalStore } from "react";
import { Button, Group } from "@mantine/core";
import { createViewState } from "./view-state";
export const scaleControlsState = createViewState<{
  relative: string;
  returning: boolean;
  movable: boolean;
  keys: { label: string; title: string; disabled: boolean }[];
}>;
export function ScaleRelative({
  model,
  toggle,
}: {
  model: ReturnType<typeof scaleControlsState>;
  toggle(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  if (!state.relative) return null;
  return (
    <Button
      className="scale-relative-switch soundtools-ui"
      variant="subtle"
      size="xs"
      aria-pressed={state.returning}
      onClick={toggle}
    >
      {state.relative}
    </Button>
  );
}
export function ScaleNavigation({
  model,
  move,
}: {
  model: ReturnType<typeof scaleControlsState>;
  move(direction: number): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Group
      gap="xs"
      justify="space-between"
      wrap="nowrap"
      className="soundtools-ui"
      hidden={!state.movable}
    >
      <Button
        variant="default"
        size="xs"
        miw={44}
        className="scale-prev"
        aria-label="Previous key"
        aria-keyshortcuts="ArrowLeft"
        title={state.keys[0]?.title}
        disabled={state.keys[0]?.disabled}
        onClick={() => move(-1)}
      >
        {state.keys[0]?.label}
      </Button>
      <Button
        variant="default"
        size="xs"
        miw={44}
        className="scale-next"
        aria-label="Next key"
        aria-keyshortcuts="ArrowRight"
        title={state.keys[1]?.title}
        disabled={state.keys[1]?.disabled}
        onClick={() => move(1)}
      >
        {state.keys[1]?.label}
      </Button>
    </Group>
  );
}
