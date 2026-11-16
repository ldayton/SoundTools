import type { ReactNode } from "react";
import { Box } from "@mantine/core";
import { CommittedNumber } from "./committed-number";

/** One consistent property field for numeric settings in the toolbar. */
export function ToolbarNumber({
  id,
  label,
  icon,
  unit,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange(value: number): void;
}) {
  return (
    <Box w={unit.length > 2 ? 112 : 96} title={label}>
      <CommittedNumber
        id={id}
        label={label}
        hideLabel
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        leftSection={icon}
        leftSectionWidth={24}
        rightSectionWidth={24}
        leftSectionPointerEvents="none"
        suffix={` ${unit}`}
        styles={{
          input: {
            fontVariantNumeric: "tabular-nums",
            textAlign: "center",
            paddingInline: 24,
          },
        }}
        change={onChange}
      />
    </Box>
  );
}
