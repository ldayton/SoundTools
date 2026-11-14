import { Slider, Stack, Text } from "@mantine/core";
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
  return (
    <Stack gap="xs">
      <Text component="label" htmlFor={id} size="sm">
        {label}{" "}
        <output id={`${id}-value`} htmlFor={id}>
          {value === 0 ? "Muted" : `${value}%`}
        </output>
      </Text>
      <Slider
        thumbProps={{ id }}
        thumbLabel={label}
        thumbValueText={(value) => (value === 0 ? "Muted" : `${value} percent`)}
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={onChange}
      />
    </Stack>
  );
}
