import { useLayoutEffect, useRef, useState } from "react";
import { NumberInput } from "@mantine/core";
/** An editing buffer is not a second settings owner: only committed values reach the controller. */
export function CommittedNumber({
  value,
  change,
  ...props
}: {
  value: number;
  change(value: number): void;
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  hideControls?: boolean;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState<string | number>(value);
  const current = useRef<string | number>(value);
  useLayoutEffect(() => {
    current.current = value;
    setDraft(value);
  }, [value]);
  function commit() {
    const next =
      typeof current.current === "number" && Number.isFinite(current.current)
        ? Math.max(props.min, Math.min(props.max, current.current))
        : value;
    current.current = next;
    setDraft(next);
    if (next !== value) change(next);
  }
  return (
    <NumberInput
      {...props}
      allowDecimal={false}
      role="spinbutton"
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={typeof draft === "number" ? draft : undefined}
      onValueChange={(values, info) => {
        if (
          ["increment", "decrement"].includes(info.source as string) &&
          values.floatValue !== undefined
        ) {
          current.current = values.floatValue;
          setDraft(values.floatValue);
          if (values.floatValue !== value) change(values.floatValue);
        }
      }}
      value={draft}
      onChange={(value) => {
        current.current = value;
        setDraft(value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
