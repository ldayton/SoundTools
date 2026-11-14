// SPDX-License-Identifier: GPL-3.0-or-later
import { useLayoutEffect, useRef, useState } from "react";
import { NumberInput } from "@mantine/core";

/** Incomplete text stays local; only finite committed values reach the model. */
export function CommittedSettingNumber({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  change,
  reset = 0,
  ariaLabel,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  change(value: number): boolean;
  reset?: number;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | number>(value),
    current = useRef<string | number>(value);
  const [rejected, setRejected] = useState(0);
  useLayoutEffect(() => {
    current.current = value;
    setDraft(value);
  }, [value, reset]);
  function commit() {
    const n = current.current === "" ? NaN : Number(current.current),
      next = Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : value;
    current.current = next;
    setDraft(next);
    if (next !== value && !change(next)) {
      current.current = value;
      setDraft(value);
      setRejected((epoch) => epoch + 1);
    }
  }
  return (
    <NumberInput
      key={`${reset}:${rejected}`}
      id={id}
      data-commit-on-blur="true"
      label={label}
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(next) => {
        current.current = next;
        setDraft(next);
      }}
      onValueChange={(values, info) => {
        if (
          ["increment", "decrement"].includes(info.source as string) &&
          values.floatValue !== undefined
        ) {
          current.current = values.floatValue;
          setDraft(values.floatValue);
          if (values.floatValue !== value && !change(values.floatValue)) {
            current.current = value;
            setDraft(value);
            setRejected((epoch) => epoch + 1);
          }
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
          current.current = value;
          setDraft(value);
        }
      }}
    />
  );
}
