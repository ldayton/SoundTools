import { useLayoutEffect, useRef, useState } from "react";
import { Button, Group, Input } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { NoteWheel } from "@ldayton/browser-controls/note-wheel";
import { PitchField, type PitchChoice } from "./pitch-field";
import "./responsive-pitch-field.css";

const dismissals = new Set<() => void>();
export function closePitchFields() {
  dismissals.forEach((close) => close());
}
/** One field lifecycle; apps supply musical choices and constraints. */
export function ResponsivePitchField({
  id,
  label,
  value,
  choices,
  onChange,
  columns = 12,
  optional = false,
  mobileWheel = false,
  wheelId = `${id}-wheel`,
}: {
  id: string;
  label: string;
  value: number;
  choices: readonly PitchChoice[];
  onChange(value: number): void;
  columns?: 7 | 12;
  optional?: boolean;
  mobileWheel?: boolean;
  wheelId?: string;
}) {
  const [opened, setOpened] = useState(false);
  const narrow = useMediaQuery("(max-width: 760px)", undefined, {
    getInitialValueInEffect: false,
  });
  const host = useRef<HTMLDivElement>(null);
  const wheel = useRef<NoteWheel>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const enabled = choices.filter((choice) => !choice.disabled);
  const low = optional ? -1 : choices[0].value;
  const high = choices[choices.length - 1].value;
  const minimum = optional ? -1 : (enabled[0]?.value ?? low);
  const maximum = enabled[enabled.length - 1]?.value ?? high;
  const labelId = `${id}-label`;
  useLayoutEffect(() => {
    const close = () => setOpened(false);
    dismissals.add(close);
    return () => {
      dismissals.delete(close);
    };
  }, []);
  useLayoutEffect(() => {
    if (!mobileWheel) return;
    const node = host.current!;
    const labels = new Map(
      choices.map((choice) => [choice.value, choice.label]),
    );
    const control = new NoteWheel(node, (next) => callback.current(next), {
      low,
      high,
      label: (next) => labels.get(next) ?? "None",
      keyboard: true,
    });
    wheel.current = control;
    return () => {
      control.destroy();
      node.replaceChildren();
      wheel.current = null;
    };
  }, [mobileWheel, low, high]);
  useLayoutEffect(() => {
    wheel.current?.setLimits(minimum, maximum);
    wheel.current?.setValue(value);
  }, [value, minimum, maximum, mobileWheel]);
  return (
    <div className="responsive-pitch-field">
      <Group justify="space-between" gap="xs" wrap="nowrap" mb={4}>
        <Input.Label
          id={labelId}
          htmlFor={mobileWheel && narrow ? undefined : id}
          onClick={() => {
            if (mobileWheel && narrow)
              host.current?.focus({ preventScroll: true });
          }}
        >
          {label}
        </Input.Label>
        {optional && (
          <Button
            variant="subtle"
            size="compact-xs"
            aria-label={`Clear ${label.toLowerCase()}`}
            style={{ visibility: value === -1 ? "hidden" : "visible" }}
            onClick={() => {
              onChange(-1);
              setOpened(false);
              (mobileWheel && narrow
                ? host.current
                : document.getElementById(id)
              )?.focus({ preventScroll: true });
            }}
          >
            Clear
          </Button>
        )}
      </Group>
      <div className={mobileWheel ? "responsive-pitch-desktop" : undefined}>
        <PitchField
          id={id}
          label={label}
          value={value}
          choices={choices}
          columns={columns}
          optional={optional}
          opened={opened}
          onOpenedChange={setOpened}
          onChange={onChange}
        />
      </div>
      {mobileWheel && (
        <div className="note-spinner responsive-pitch-mobile">
          <div className="note-wheel-selection" aria-hidden="true" />
          <div
            ref={host}
            id={wheelId}
            className="note-wheel"
            role="spinbutton"
            tabIndex={0}
            aria-label={label}
            aria-labelledby={labelId}
            aria-valuemin={minimum}
            aria-valuemax={maximum}
          />
        </div>
      )}
    </div>
  );
}
