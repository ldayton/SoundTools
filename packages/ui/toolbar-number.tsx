import type { ReactNode } from "react";
import { ActionIcon, Box } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { CommittedNumber } from "./committed-number";
import { ControlIcon } from "./control-icon";
import "./toolbar-number.css";

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
  const touchLayout = useMediaQuery(
    "(max-width: 767px), (any-pointer: coarse)",
    undefined,
    {
      getInitialValueInEffect: false,
    },
  );
  if (touchLayout)
    return (
      <Box
        className="toolbar-number-touch"
        w={unit.length > 2 ? 172 : undefined}
        role="group"
        aria-label={label}
      >
        <ActionIcon
          id={`${id}-down`}
          variant="subtle"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <ControlIcon name="minus" />
        </ActionIcon>
        <ActionIcon
          id={`${id}-up`}
          variant="subtle"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          <ControlIcon name="plus" />
        </ActionIcon>
        <CommittedNumber
          id={id}
          label={label}
          hideLabel
          hideControls
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          suffix={` ${unit}`}
          change={onChange}
        />
      </Box>
    );
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
