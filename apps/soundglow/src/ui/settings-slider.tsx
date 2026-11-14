// SPDX-License-Identifier: GPL-3.0-or-later
import { Group, Input, Slider } from "@mantine/core";

/** Shared presentation for the explicit spectrogram and pitch slider controls. */
export function SettingsSlider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  change,
  format = String,
  outputId,
  valueText,
  disabled = false,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  change(value: number): void;
  format?(value: number): string;
  outputId?: string;
  valueText?(value: number): string;
  disabled?: boolean;
}) {
  return (
    <Input.Wrapper
      label={
        <Group justify="space-between" gap="xs">
          <span>{label}</span>
          <output id={outputId}>{format(value)}</output>
        </Group>
      }
      labelElement="div"
      styles={{ label: { display: "block" } }}
    >
      <Slider
        name={id}
        hiddenInputProps={{ id, disabled }}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={change}
        label={format}
        thumbLabel={label}
        thumbValueText={valueText || format}
        disabled={disabled}
        thumbProps={{ id: `${id}-slider`, ...{ "data-step": step } }}
        mt="sm"
        mb="xs"
      />
    </Input.Wrapper>
  );
}
