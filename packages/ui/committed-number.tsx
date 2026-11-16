import { useLayoutEffect, useRef, useState } from "react";
import { NumberInput, type NumberInputProps } from "@mantine/core";

/** Draft text is local. Only committed values reach the settings owner. */
export function CommittedNumber({
  value,
  change,
  reset = 0,
  allowDecimal = false,
  hideLabel = false,
  ...props
}: {
  value: number;
  change(value: number): boolean | void;
  reset?: number;
  allowDecimal?: boolean;
  hideLabel?: boolean;
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  hideControls?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
} & Pick<
  NumberInputProps,
  | "leftSection"
  | "leftSectionWidth"
  | "rightSectionWidth"
  | "leftSectionPointerEvents"
  | "suffix"
  | "styles"
>) {
  const [draft, setDraft] = useState<string | number>(value);
  const current = useRef<string | number>(value);
  const dirty = useRef(false);
  const [rejected, setRejected] = useState(0);
  useLayoutEffect(() => {
    current.current = value;
    dirty.current = false;
    setDraft(value);
  }, [value, reset, props.min, props.max]);
  function commit() {
    if (!dirty.current) return;
    dirty.current = false;
    const number = current.current === "" ? NaN : Number(current.current);
    const next = Number.isFinite(number)
      ? Math.max(
          props.min,
          Math.min(props.max, allowDecimal ? number : Math.trunc(number)),
        )
      : value;
    current.current = next;
    setDraft(next);
    if (next !== value && change(next) === false) {
      current.current = value;
      setDraft(value);
      // NumericFormat can retain rejected text when the controlled value is unchanged.
      setRejected((epoch) => epoch + 1);
    }
  }
  return (
    <NumberInput
      {...props}
      label={hideLabel ? undefined : props.label}
      aria-label={props["aria-label"] || props.label}
      key={`${reset}:${rejected}`}
      allowDecimal={allowDecimal}
      data-commit-on-blur="true"
      role="spinbutton"
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={typeof draft === "number" ? draft : undefined}
      value={draft}
      onChange={(next) => {
        current.current = next;
        dirty.current = true;
        setDraft(next);
      }}
      onValueChange={(values, info) => {
        if (
          ["increment", "decrement"].includes(info.source as string) &&
          values.floatValue !== undefined
        ) {
          current.current = values.floatValue;
          dirty.current = true;
          commit();
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dirty.current = false;
          current.current = value;
          setDraft(value);
        }
      }}
    />
  );
}
