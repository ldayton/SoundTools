// SPDX-License-Identifier: GPL-3.0-or-later
import { useSyncExternalStore } from "react";
import { Checkbox, NativeSelect, Stack, Title } from "@mantine/core";
import { createViewState } from "@ldayton/ui/view-state";
import pitchOptions from "./pitch-options.json";
import { CommittedSettingNumber } from "./committed-setting-number";

type PitchValues = {
  minimum: number;
  maximum: number;
  history: number;
  axis: string;
  smoothing: string;
  [key: string]: unknown;
};
type Limits = Record<string, { min: number; max: number; step: number }>;
const basicFields = {
  pitchMinimum: "minimum",
  pitchMaximum: "maximum",
  pitchHistory: "history",
  pitchAxis: "axis",
  pitchSmoothing: "smoothing",
  pitchMethod: "method",
  pitchSpeechGate: "speechGate",
  pitchConfirmation: "confirmationMs",
  pitchUncertainJumps: "breakUnconfirmedJumps",
} as const;
export function createPitchControls(initial: PitchValues, limits: Limits) {
  const model = createViewState({ values: initial, reset: 0 });
  let edit: ((field: string, value: unknown) => boolean) | undefined;
  function Numeric({
    id,
    label,
  }: {
    id: keyof typeof basicFields;
    label: string;
  }) {
    const view = useSyncExternalStore(model.subscribe, model.getSnapshot),
      field = basicFields[id],
      bounds = limits[field];
    return (
      <CommittedSettingNumber
        id={id}
        label={label}
        value={Number(view.values[field])}
        {...bounds}
        change={(value) => edit?.(field, value) ?? false}
        reset={view.reset}
      />
    );
  }
  function BasicControls() {
    const { values } = useSyncExternalStore(model.subscribe, model.getSnapshot);
    return (
      <Stack gap="md">
        <Title order={4} size="h5">
          Display
        </Title>
        <Numeric id="pitchMinimum" label="Visible minimum (Hz)" />
        <Numeric id="pitchMaximum" label="Visible maximum (Hz)" />
        <NativeSelect
          id="pitchAxis"
          label="Frequency scale"
          data={[
            { value: "linear", label: "Linear" },
            { value: "log", label: "Logarithmic" },
          ]}
          value={values.axis}
          onChange={(e) => edit?.("axis", e.currentTarget.value)}
        />
        <Numeric id="pitchHistory" label="History (seconds)" />
        <Title order={4} size="h5">
          Trace
        </Title>
        <NativeSelect
          id="pitchSmoothing"
          label="Smoothing"
          data={[
            { value: "off", label: "Off" },
            { value: "light", label: "Light" },
          ]}
          value={values.smoothing}
          onChange={(e) => edit?.("smoothing", e.currentTarget.value)}
        />
      </Stack>
    );
  }
  function DetectionControls() {
    const { values } = useSyncExternalStore(model.subscribe, model.getSnapshot);
    return (
      <Stack gap="md">
        <NativeSelect
          id="pitchMethod"
          label="Pitch detector"
          data={pitchOptions.pitchMethod}
          value={String(values.method)}
          onChange={(event) => edit?.("method", event.currentTarget.value)}
        />
        <Checkbox
          id="pitchSpeechGate"
          label="Filter non-speech"
          checked={!!values.speechGate}
          onChange={(event) =>
            edit?.("speechGate", event.currentTarget.checked)
          }
        />
        <NativeSelect
          id="pitchConfirmation"
          label="Confirmation delay"
          data={pitchOptions.pitchConfirmation}
          value={String(values.confirmationMs)}
          onChange={(event) =>
            edit?.("confirmationMs", Number(event.currentTarget.value))
          }
        />
        <Checkbox
          id="pitchUncertainJumps"
          label="Break uncertain octave jumps"
          checked={!!values.breakUnconfirmedJumps}
          onChange={(event) =>
            edit?.("breakUnconfirmedJumps", event.currentTarget.checked)
          }
        />
      </Stack>
    );
  }
  return {
    BasicControls,
    DetectionControls,
    owns(id: string) {
      return Object.hasOwn(basicFields, id);
    },
    connect(change: NonNullable<typeof edit>) {
      edit = change;
    },
    publish(values: PitchValues, reset = false) {
      const old = model.getSnapshot();
      if (reset || JSON.stringify(old.values) !== JSON.stringify(values))
        model.set({ values, reset: old.reset + (reset ? 1 : 0) });
    },
  };
}
declare global {
  interface Window {
    FeatureState: {
      pitch(input?: unknown): PitchValues;
      presets: { soundglow: unknown };
      inputLimits: Limits;
    };
  }
}
