import type { ReactNode } from "react";
import { ActionIcon, Popover, Slider, Stack, Text } from "@mantine/core";
import { useVolumeMute, VolumeMuteButton } from "./volume-control";

/** Matching vertical controls for settings in a compact transport toolbar. */
export function ToolbarSlider({
  id,
  label,
  buttonLabel = label,
  value,
  min,
  max,
  onChange,
  icon,
  withMute = false,
  valueText = `${value}%`,
}: {
  id: string;
  label: string;
  buttonLabel?: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  icon: ReactNode;
  withMute?: boolean;
  valueText?: string;
}) {
  const mute = useVolumeMute(value, min, max, onChange);
  // The primary keyboard control stays the slider when a mute button is added.
  const thumbProps = { id, "data-autofocus": true };
  return (
    <Popover position="bottom" width={withMute ? 76 : 64} trapFocus>
      <Popover.Target>
        <ActionIcon
          variant="default"
          size={36}
          aria-label={buttonLabel}
          title={`${label}: ${valueText}`}
        >
          {icon}
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown px="xs" py="sm">
        <Stack align="center" gap="sm">
          {withMute && <VolumeMuteButton {...mute} label={label} />}
          <Slider
            thumbProps={thumbProps}
            thumbLabel={label}
            thumbValueText={() => valueText}
            orientation="vertical"
            h={160}
            min={min}
            max={max}
            step={1}
            value={value}
            label={null}
            onChange={onChange}
          />
          <Text component="output" htmlFor={id} size="xs">
            {valueText}
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
