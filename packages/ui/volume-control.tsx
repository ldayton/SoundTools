import { useLayoutEffect, useRef } from "react";
import { ActionIcon, Group, Slider, Stack, Text } from "@mantine/core";

/** Remember the audible level while silence still uses the owner's existing value. */
export function useVolumeMute(
  value: number,
  min: number,
  max: number,
  onChange: (value: number) => void,
) {
  const audible = useRef(value > min ? value : min + (max - min) / 2);
  useLayoutEffect(() => {
    if (value > min) audible.current = value;
  }, [value, min]);
  return {
    muted: value <= min,
    toggle: () =>
      onChange(
        value <= min ? Math.min(max, Math.max(min, audible.current)) : min,
      ),
  };
}

export function VolumeMuteButton({
  muted,
  toggle,
  label = "Volume",
}: {
  muted: boolean;
  toggle(): void;
  label?: string;
}) {
  const action = `${muted ? "Unmute" : "Mute"}${label === "Volume" ? "" : ` ${label.toLowerCase()}`}`;
  return (
    <ActionIcon
      size={44}
      variant={muted ? "light" : "default"}
      aria-label={action}
      title={action}
      aria-pressed={muted}
      onClick={toggle}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M11 4 6 8H3v8h3l5 4Z" />
        {muted ? (
          <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
        ) : (
          <path d="m16 9 6 6m0-6-6 6" />
        )}
      </svg>
    </ActionIcon>
  );
}
export function VolumeControl({
  id,
  label = "Volume",
  value,
  onChange,
}: {
  id: string;
  label?: string;
  value: number;
  onChange(value: number): void;
}) {
  const mute = useVolumeMute(value, 0, 100, onChange);
  return (
    <Stack gap="xs">
      <Text component="label" htmlFor={id} size="sm">
        {label}{" "}
        <output id={`${id}-value`} htmlFor={id}>
          {value === 0 ? "Muted" : `${value}%`}
        </output>
      </Text>
      <Group gap="xs" wrap="nowrap">
        <VolumeMuteButton {...mute} label={label} />
        <Slider
          style={{ flex: 1 }}
          thumbProps={{ id }}
          thumbLabel={label}
          thumbValueText={(value) =>
            value === 0 ? "Muted" : `${value} percent`
          }
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={onChange}
        />
      </Group>
    </Stack>
  );
}
