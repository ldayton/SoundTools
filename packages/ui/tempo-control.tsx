import { ActionIcon, Box, Group, Slider } from "@mantine/core";
import { ToolbarNumber } from "./toolbar-number";
import { ControlIcon } from "./control-icon";
import { CommittedNumber } from "./committed-number";
/** Shared entry/stepping policy; apps own tempo limits and audio behavior. */
export function TempoControl({
  id,
  value,
  min,
  max,
  onChange,
  sliderId,
  compact = false,
  disabled = false,
  decreaseId = `${id}-down`,
  increaseId = `${id}-up`,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  sliderId?: string;
  compact?: boolean;
  disabled?: boolean;
  decreaseId?: string;
  increaseId?: string;
}) {
  if (compact)
    return (
      <ToolbarNumber
        id={id}
        label="Tempo in beats per minute"
        icon={<ControlIcon name="tempo" />}
        unit="BPM"
        value={value}
        min={min}
        max={max}
        step={5}
        disabled={disabled}
        onChange={onChange}
      />
    );
  const step = (direction: number) =>
    onChange(Math.max(min, Math.min(max, value + direction * 5)));
  return (
    <Group gap="md" align="end">
      <Group gap="xs" wrap="nowrap" align="end" w="100%" maw={184}>
        <ActionIcon
          id={decreaseId}
          variant="default"
          size="lg"
          aria-label="Decrease tempo by 5 BPM"
          disabled={disabled || value <= min}
          onClick={() => step(-1)}
        >
          −
        </ActionIcon>
        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <CommittedNumber
            id={id}
            label="Tempo"
            aria-label="Tempo in beats per minute"
            min={min}
            max={max}
            value={value}
            step={5}
            hideControls
            disabled={disabled}
            change={onChange}
          />
        </div>
        <ActionIcon
          id={increaseId}
          variant="default"
          size="lg"
          aria-label="Increase tempo by 5 BPM"
          disabled={disabled || value >= max}
          onClick={() => step(1)}
        >
          +
        </ActionIcon>
      </Group>
      {sliderId && (
        <Box flex="1 1 200px" miw={0} pb="md">
          <Slider
            thumbProps={{ id: sliderId }}
            thumbLabel="Tempo slider"
            thumbValueText={(n) => `${n} beats per minute`}
            min={min}
            max={max}
            step={5}
            disabled={disabled}
            value={value}
            onChange={onChange}
          />
        </Box>
      )}
    </Group>
  );
}
