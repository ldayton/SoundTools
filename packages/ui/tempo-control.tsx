import { ActionIcon, Box, Group, Slider } from "@mantine/core";
import { CommittedNumber } from "./committed-number";
/** Shared entry/stepping policy; apps own tempo limits and audio behavior. */
export function TempoControl({
  id,
  value,
  min,
  max,
  onChange,
  sliderId,
  decreaseId = `${id}-down`,
  increaseId = `${id}-up`,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  sliderId?: string;
  decreaseId?: string;
  increaseId?: string;
}) {
  const step = (direction: number) =>
    onChange(Math.max(min, Math.min(max, value + direction * 5)));
  return (
    <Group gap="md" align="end">
      <Group gap="xs" wrap="nowrap" align="end" w="100%" maw={280}>
        <ActionIcon
          id={decreaseId}
          variant="default"
          size="lg"
          aria-label="Decrease tempo by 5 BPM"
          disabled={value <= min}
          onClick={() => step(-1)}
        >
          −
        </ActionIcon>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CommittedNumber
            id={id}
            label="Tempo"
            aria-label="Tempo in beats per minute"
            min={min}
            max={max}
            value={value}
            step={5}
            hideControls
            change={onChange}
          />
        </div>
        <ActionIcon
          id={increaseId}
          variant="default"
          size="lg"
          aria-label="Increase tempo by 5 BPM"
          disabled={value >= max}
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
            value={value}
            onChange={onChange}
          />
        </Box>
      )}
    </Group>
  );
}
