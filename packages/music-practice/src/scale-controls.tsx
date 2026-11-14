import { useSyncExternalStore, type ReactNode } from "react";
import { Accordion, Button, Group, Text } from "@mantine/core";
import { createViewState } from "./view-state";
export const scaleControlsState = createViewState<{
  relative: string;
  returning: boolean;
  movable: boolean;
  caption: string;
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
        title={state.keys[0]?.title}
        disabled={state.keys[0]?.disabled}
        onClick={() => move(-1)}
      >
        {state.keys[0]?.label}
      </Button>
      <Text
        size="xs"
        className="scale-pattern-caption"
        role="status"
        ta="center"
      >
        {state.caption}
      </Text>
      <Button
        variant="default"
        size="xs"
        miw={44}
        className="scale-next"
        aria-label="Next key"
        title={state.keys[1]?.title}
        disabled={state.keys[1]?.disabled}
        onClick={() => move(1)}
      >
        {state.keys[1]?.label}
      </Button>
    </Group>
  );
}
export function ScaleDetails({ children }: { children: ReactNode }) {
  return (
    <Accordion
      keepMounted
      keepMountedMode="display-none"
      id="scale-details"
      variant="default"
      className="soundtools-ui"
    >
      <Accordion.Item value="details">
        <Accordion.Control>Details</Accordion.Control>
        <Accordion.Panel>{children}</Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
