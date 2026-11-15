// SPDX-License-Identifier: GPL-3.0-or-later
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
  Accordion,
  NativeSelect,
  Stack,
  Title,
  Box,
  Text,
} from "@mantine/core";
import colourOptions from "./advancedColour-options.json";
import analysisOptions from "./advancedAnalysis-options.json";
import { SettingsSlider } from "./settings-slider";
import { createViewState } from "@ldayton/ui/view-state";

import {
  displayControlIds,
  colourControlIds,
  formantControlIds,
  analysisControlIds,
  advancedColourIds,
  settingIds,
  type SettingId,
  type SpectrogramValues as Values,
  type SettingRegistry as Registry,
  type SpectrogramEdit,
} from "../settings-contracts";
export { displayControlIds, colourControlIds } from "../settings-contracts";
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
export function createSpectrogramControls(registry: Registry) {
  const project = (values: Values) =>
    Object.fromEntries(settingIds.map((id) => [id, values[id]])) as Values;
  const model = createViewState(
    project(
      Object.fromEntries(
        settingIds.map((id) => [id, registry[id].default]),
      ) as Values,
    ),
  );
  let edit: SpectrogramEdit | undefined;
  const options = (id: SettingId, labels: Record<string, string>) =>
    registry[id].values!.map((value) => ({
      value,
      label: labels[value] || value,
    }));
  const ceilingOptions = options("maximum", ceilingLabels),
    scaleOptions = options("scale", scaleLabels);
  function DisplayControls() {
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
        <Range
          id="history"
          label="History"
          format={(value) => `${value} s`}
          outputId="historyOut"
          valueText={(value) => `${value} seconds`}
        />
      </Stack>
    );
  }
  function Choice({
    id,
    label,
    data,
    disabled = false,
  }: {
    id: SettingId;
    label: string;
    data: { value: string; label: string }[];
    disabled?: boolean;
  }) {
    const values = useSyncExternalStore(model.subscribe, model.getSnapshot);
    return (
      <NativeSelect
        id={id}
        label={label}
        data={data}
        disabled={disabled}
        value={values[id]}
        onChange={(event) => edit?.(id, event.currentTarget.value)}
      />
    );
  }
  function Range({
    id,
    label,
    format,
    outputId,
    valueText,
    disabled = false,
  }: {
    id: SettingId;
    label: string;
    format?: (value: number) => string;
    outputId?: string;
    valueText?(value: number): string;
    disabled?: boolean;
  }) {
    const values = useSyncExternalStore(model.subscribe, model.getSnapshot),
      entry = registry[id];
    return (
      <SettingsSlider
        id={id}
        label={label}
        value={Number(values[id])}
        min={entry.min!}
        max={entry.max!}
        step={entry.step}
        change={(value) => edit?.(id, String(value))}
        format={format}
        outputId={outputId}
        valueText={valueText}
        disabled={disabled}
      />
    );
  }
  function ColourControls() {
    const values = useSyncExternalStore(model.subscribe, model.getSnapshot);
    const db = (value: number) => `${value} dB`;
    return (
      <Stack gap="md">
        <Title order={4} size="h5">
          Colour and contrast
        </Title>
        <Choice
          id="palette"
          label="Colour palette"
          data={options("palette", {
            reference: "Soundglow",
            plasma: "Plasma",
          })}
        />
        <Range id="gain" label="Brightness" format={db} outputId="gainOut" />
        <Range
          id="floor"
          label="Dynamic range"
          format={db}
          outputId="floorOut"
          disabled={values.colourLevels === "held"}
        />
        <Choice
          id="colourLevels"
          label="Colour levels"
          data={options("colourLevels", {
            auto: "Automatic · visible history",
            fixed: "Fixed",
            held: "Relative · held peak",
          })}
        />
        <Box id="fixedMaximumControl" hidden={values.colourLevels !== "fixed"}>
          <Range
            id="fixedMaximum"
            label="Colour maximum"
            format={db}
            outputId="fixedMaximumOut"
          />
        </Box>
        <Range
          id="suppression"
          label="Background suppression"
          format={db}
          outputId="suppressionOut"
        />
        <Range
          id="preemphasis"
          label="Pre-emphasis"
          format={(value) => `${value} dB/octave`}
          outputId="preemphasisOut"
        />
        <Range
          id="compression"
          label="Quiet-frame boost"
          format={(value) => `${Math.round(value * 100)}%`}
          outputId="compressionOut"
        />
        <Text size="xs" c="dimmed">
          These controls change the displayed brightness and contrast, not the
          sound.
        </Text>
      </Stack>
    );
  }
  function FormantControls() {
    return (
      <Stack gap="md">
        <Title order={4} size="h5">
          Formants
        </Title>
        <Choice
          id="formants"
          label="Formants"
          data={options("formants", {
            off: "Off",
            dots: "Markers",
            tracks: "Connected tracks",
            both: "Markers and tracks",
          })}
        />
        <Choice
          id="formantSmoothing"
          label="Formant smoothing"
          data={options("formantSmoothing", {
            off: "Off",
            light: "Light",
            strong: "Strong",
          })}
        />
        <Choice
          id="formantFiltering"
          label="Hide uncertain formants"
          data={options("formantFiltering", { on: "On", off: "Off" })}
        />
        <Choice
          id="formantCeiling"
          label="Formant ceiling"
          data={options("formantCeiling", {
            "5000": "5000 Hz",
            "5500": "5500 Hz",
            "6000": "6000 Hz",
          })}
        />
        <Text size="xs" c="dimmed">
          Tracks are estimates; gaps indicate missing or rejected measurements.
        </Text>
      </Stack>
    );
  }
  const analysisData = (id: keyof typeof analysisOptions) =>
    options(
      id,
      Object.fromEntries(
        analysisOptions[id].map((item) => [item.value, item.label]),
      ),
    );
  function AnalysisControls() {
    const values = useSyncExternalStore(model.subscribe, model.getSnapshot);
    return (
      <Accordion keepMounted keepMountedMode="display-none">
        <Accordion.Item value="analysis" id="advancedAnalysis">
          <Accordion.Control>Advanced analysis</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Choice
                id="window"
                label="Analysis window"
                data={analysisData("window")}
              />
              <Choice
                id="windowShape"
                label="Window shape"
                data={analysisData("windowShape")}
              />
              <Choice
                id="analysisRate"
                label="Analysis sample rate"
                data={analysisData("analysisRate")}
              />
              <Choice
                id="frameStep"
                label="Frame spacing"
                data={analysisData("frameStep")}
              />
              <Choice
                id="fftPadding"
                label="FFT padding"
                data={analysisData("fftPadding")}
              />
              <Choice
                id="removeDC"
                label="Remove DC offset"
                data={analysisData("removeDC")}
              />
              <Choice
                id="spectrumUnits"
                label="Spectrum levels"
                data={analysisData("spectrumUnits")}
              />
              <Choice
                id="resampling"
                label="Resampling filter"
                data={analysisData("resampling")}
              />
              <Choice
                id="resampleQuality"
                label="Resampling quality"
                data={analysisData("resampleQuality")}
                disabled={values.resampling !== "polyphase"}
              />
              <Text size="xs" c="dimmed">
                The frequency ceiling cannot exceed half the analysis sample
                rate. Resampling applies only when the analysis and input rates
                differ; quality applies to the Kaiser polyphase filter.
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
  }
  const colourData = (id: keyof typeof colourOptions) =>
    options(
      id,
      Object.fromEntries(
        colourOptions[id].map((item) => [item.value, item.label]),
      ),
    );
  function AdvancedColourControls() {
    return (
      <Accordion keepMounted keepMountedMode="display-none">
        <Accordion.Item value="colour" id="advancedColour">
          <Accordion.Control>Advanced colour</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Choice
                id="normalizationClock"
                label="Normalization timing"
                data={colourData("normalizationClock")}
              />
              <Choice
                id="interpolation"
                label="Frequency interpolation"
                data={colourData("interpolation")}
              />
              <Choice
                id="frameInterpolation"
                label="Frame interpolation"
                data={colourData("frameInterpolation")}
              />
              <Choice
                id="peakSeconds"
                label="Peak memory"
                data={colourData("peakSeconds")}
              />
              <Choice
                id="peakDecay"
                label="Peak decay per frame"
                data={colourData("peakDecay")}
              />
              <Text size="xs" c="dimmed">
                Peak memory, peak decay and normalization timing apply to
                relative held-peak colour levels.
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
  }
  return {
    DisplayControls,
    ColourControls,
    FormantControls,
    AnalysisControls,
    AdvancedColourControls,
    connect(change: NonNullable<typeof edit>) {
      edit = change;
    },
    publish(values: Values) {
      const next = project(values),
        previous = model.getSnapshot();
      if (settingIds.some((id) => next[id] !== previous[id]))
        flushSync(() => model.set(next));
    },
  };
}

declare global {
  interface Window {
    SettingsState: { registry: Registry };
  }
}
