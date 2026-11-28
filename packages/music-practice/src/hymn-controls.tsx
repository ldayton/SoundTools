import { ToolbarVolume } from "./sidebar-controls";
import { ControlIcon } from "@ldayton/ui/control-icon";
import { useSyncExternalStore, type ReactNode } from "react";
import { Button, Checkbox, Group, Text } from "@mantine/core";
import { createViewState } from "./view-state";
import { useMediaQuery } from "@mantine/hooks";
import { MOBILE_SONGALONG_QUERY } from "./songalong-capabilities";
import { PracticePianoToggle } from "./piano-presentation";
export const hymnControlsState = createViewState<{
  disabled: boolean;
  pauseDisabled: boolean;
  pause: string;
  restore: string;
  previous: boolean;
  selecting: boolean;
  selected: boolean;
  loop: boolean;
  status: string;
  stanza: string;
}>;
export type HymnControlsState = ReturnType<typeof hymnControlsState>;
export function HymnControls({
  model,
  panelId,
  settings,
  instrument,
  staffSize,
  staffSpacing,
  fingerings,
  pause,
  goToStart,
  restore,
  previous,
}: {
  model: HymnControlsState;
  panelId: string;
  settings?: ReactNode;
  instrument?: ReactNode;
  staffSize?: ReactNode;
  staffSpacing?: ReactNode;
  fingerings?: ReactNode;
  pause(): void;
  goToStart(): void;
  restore(): void;
  previous(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const mobile = useMediaQuery(MOBILE_SONGALONG_QUERY, undefined, {
    getInitialValueInEffect: false,
  });
  const transport = (
    <Group gap={4} wrap="nowrap" role="group" aria-label="Transport">
      <Button
        aria-label="Go to start"
        title={state.selected ? "Go to selection start" : "Go to start"}
        w={36}
        miw={36}
        px={0}
        className="hymn-go-start"
        variant="default"
        disabled={state.disabled}
        onClick={goToStart}
      >
        <ControlIcon name="go-start" />
      </Button>
      <Button
        aria-label={state.pause}
        title={state.pause}
        w={36}
        miw={36}
        px={0}
        className="hymn-pause"
        variant="filled"
        disabled={state.disabled || state.pauseDisabled}
        onClick={pause}
      >
        <ControlIcon
          name={
            state.pause === "Pause"
              ? "pause"
              : state.pause === "Cancel"
                ? "stop"
                : "play"
          }
        />
      </Button>
      {state.stanza && (
        <Text
          component="span"
          size="xs"
          c="dimmed"
          miw={64}
          className="hymn-stanza-indicator"
          role="status"
          style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
        >
          {state.stanza}
        </Text>
      )}
    </Group>
  );
  const legacy = <HymnLegacyControls model={model} restore={restore} previous={previous} />;
  const piano = (
    <PracticePianoToggle
      panelId={panelId}
      iconOnly
      className="hymn-keyboard-toggle"
      disabled={state.disabled}
    />
  );
  if (mobile)
    return (
      <div className="soundtools-ui hymn-controls">
        <div className="hymn-toolbar hymn-toolbar-mobile">
          <div className="hymn-mobile-primary" role="group" aria-label="Playback and sound">
            <div className="hymn-toolbar-playback" role="group" aria-label="Playback controls">
              {transport}
            </div>
            {instrument}
            <div className="hymn-toolbar-volume"><ToolbarVolume /></div>
          </div>
        </div>
      </div>
    );
  return (
    <div className="soundtools-ui hymn-controls">
      <div className="hymn-toolbar">
        <Group
          className="hymn-toolbar-appearance"
          gap="xs"
          wrap="nowrap"
          role="group"
          aria-label="Sound and display"
        >
          <ToolbarVolume />
          {staffSize}
          {staffSpacing}
        </Group>
        <Group
          className="hymn-toolbar-playback"
          gap="xs"
          justify="center"
          role="group"
          aria-label="Playback controls"
        >
          {instrument}
          {transport}
          {settings}
          {fingerings}
          {legacy}
        </Group>
        <div className="hymn-toolbar-piano">{piano}</div>
      </div>
    </div>
  );
}

export function HymnPassageControls({
  model,
  cancel,
  clear,
  loop,
}: {
  model: HymnControlsState;
  cancel(): void;
  clear(): void;
  loop(value: boolean): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
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
  );
}

export function HymnLegacyControls({model,restore,previous}:{model:HymnControlsState;restore():void;previous():void}) {
 const state=useSyncExternalStore(model.subscribe,model.getSnapshot);
 return (
    <>
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
    </>
 );
}
