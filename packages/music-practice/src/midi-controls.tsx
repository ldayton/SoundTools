import { useSyncExternalStore } from "react";
import { Button, Group, NativeSelect, Stack, Text } from "@mantine/core";
import { createViewState } from "./view-state";
import type { MidiState } from "./midi-input";
export const midiControlsState = createViewState<{
  text: string;
  state: MidiState;
  inputs: { id: string; name: string }[];
  selected: string;
}>;
export function MidiControls({
  model,
  connect,
  disconnect,
  select,
}: {
  model: ReturnType<typeof midiControlsState>;
  connect(): void;
  disconnect(): void;
  select(id: string): void;
}) {
  const value = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const busy = value.state === "requesting" || value.state === "opening";
  return (
    <Stack
      gap="sm"
      className={`soundtools-ui ${value.state === "connected" ? "midi-connected" : ""}`}
    >
      <Text
        size="sm"
        c={value.state === "connected" ? "green" : "dimmed"}
        style={{ overflowWrap: "anywhere" }}
        className="midi-status"
        role="status"
        aria-live="polite"
      >
        {value.text}
      </Text>
      <NativeSelect
        id="midi-input"
        className="midi-device"
        label="Input"
        aria-label="MIDI input"
        hidden={
          value.inputs.length < 2 &&
          !(value.inputs.length === 1 && !value.selected)
        }
        value={value.selected}
        data={[
          { value: "", label: "Choose input" },
          ...value.inputs.map((input) => ({
            value: input.id,
            label: input.name,
          })),
        ]}
        onChange={(event) => select(event.currentTarget.value)}
      />
      <Group gap="xs" className="midi-actions">
        <Button
          className="midi-connect"
          hidden={
            !["idle", "requesting", "opening", "denied", "error"].includes(
              value.state,
            )
          }
          disabled={busy}
          onClick={connect}
        >
          {busy
            ? "Connecting…"
            : value.state === "denied" || value.state === "error"
              ? "Retry MIDI"
              : "Connect MIDI keyboard"}
        </Button>
        <Button
          className="midi-disconnect"
          variant="default"
          hidden={["idle", "unsupported", "denied"].includes(value.state)}
          onClick={disconnect}
        >
          Disconnect
        </Button>
      </Group>
    </Stack>
  );
}
