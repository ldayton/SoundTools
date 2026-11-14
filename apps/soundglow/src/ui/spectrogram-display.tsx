// SPDX-License-Identifier: GPL-3.0-or-later
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
  Group,
  Input,
  NativeSelect,
  Slider,
  Stack,
  Title,
} from "@mantine/core";
import { createViewState } from "@ldayton/ui/view-state";

export const displayControlIds = ["maximum", "scale", "history"] as const;
type DisplayId = (typeof displayControlIds)[number];
type Values = Record<DisplayId, string>;
type Registry = Record<
  string,
  {
    default: string;
    values?: readonly string[];
    min?: number;
    max?: number;
    step?: number;
  }
>;
const ceilingLabels: Record<string, string> = {
  "2000": "2 kHz · voice detail",
  "4000": "4 kHz",
  "3500": "3.5 kHz · voice focus",
  "5000": "5 kHz",
  "8000": "8 kHz",
  "16000": "16 kHz",
  "20000": "20 kHz",
};
const scaleLabels: Record<string, string> = {
  linear: "Linear",
  erb: "ERB",
  mel: "Mel",
  voice: "Voice · expanded low frequencies",
  log: "Logarithmic · 60 Hz and up",
};

/** A projection of the controller's canonical settings, never a second settings owner. */
export function createDisplayControls(registry: Registry) {
  const project = (values: Record<string, string>) =>
    Object.fromEntries(
      displayControlIds.map((id) => [id, values[id]]),
    ) as Values;
  const model = createViewState(
    project(
      Object.fromEntries(
        displayControlIds.map((id) => [id, registry[id].default]),
      ),
    ),
  );
  let edit: ((id: DisplayId, value: string) => void) | undefined;
  const options = (id: DisplayId, labels: Record<string, string>) =>
    registry[id].values!.map((value) => ({
      value,
      label: labels[value] || value,
    }));
  const ceilingOptions = options("maximum", ceilingLabels),
    scaleOptions = options("scale", scaleLabels);
  function Controls() {
    const values = useSyncExternalStore(model.subscribe, model.getSnapshot);
    return (
      <Stack gap="md">
        <Title order={4} size="h5">
          Display
        </Title>
        <NativeSelect
          id="maximum"
          label="Frequency ceiling"
          data={ceilingOptions}
          value={values.maximum}
          onChange={(event) => edit?.("maximum", event.currentTarget.value)}
        />
        <NativeSelect
          id="scale"
          label="Frequency scale"
          data={scaleOptions}
          value={values.scale}
          onChange={(event) => edit?.("scale", event.currentTarget.value)}
        />
        <Input.Wrapper
          label={
            <Group justify="space-between" gap="xs">
              <span>History</span>
              <output id="historyOut">{values.history} s</output>
            </Group>
          }
          labelElement="div"
          styles={{ label: { display: "block" } }}
        >
          <Slider
            name="history"
            hiddenInputProps={{ id: "history" }}
            min={registry.history.min}
            max={registry.history.max}
            step={registry.history.step}
            value={Number(values.history)}
            onChange={(value) => edit?.("history", String(value))}
            label={(value) => `${value} s`}
            thumbLabel="History"
            thumbValueText={(value) => `${value} seconds`}
            mt="sm"
            mb="xs"
          />
        </Input.Wrapper>
      </Stack>
    );
  }
  return {
    Controls,
    owns(id: string) {
      return (displayControlIds as readonly string[]).includes(id);
    },
    connect(change: NonNullable<typeof edit>) {
      edit = change;
    },
    publish(values: Record<string, string>) {
      const next = project(values),
        previous = model.getSnapshot();
      if (displayControlIds.some((id) => next[id] !== previous[id]))
        flushSync(() => model.set(next));
    },
  };
}

declare global {
  interface Window {
    SettingsState: { registry: Registry };
  }
}
