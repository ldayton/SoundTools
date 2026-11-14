import { ActionIcon, Group, Slider, Stack } from "@mantine/core";
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
    onChange(
      Math.max(
        min,
        Math.min(
          max,
          direction > 0
            ? (Math.floor(value / 5) + 1) * 5
            : (Math.ceil(value / 5) - 1) * 5,
        ),
      ),
    );
  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="nowrap" align="end">
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
      )}
    </Stack>
  );
}
