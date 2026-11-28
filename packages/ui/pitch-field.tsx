import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Group, Input, Popover, Text } from "@mantine/core";
export type PitchChoice = {
  value: number;
  label: string;
  octave: number;
  column: number;
  disabled?: boolean;
};
/** A musical grid with standard field chrome, placement, dismissal and focus trapping. */
export function PitchField({
  id,
  label,
  value,
  opened,
  onOpenedChange,
  onChange,
  choices,
  columns = 12,
  rowColumns = columns,
  compactRange,
  optional = false,
  fieldLabel,
  prefix,
}: {
  choices: readonly PitchChoice[];
  columns?: 7 | 12;
  rowColumns?: 4 | 6 | 7 | 12;
  /** A shorter initial view; the complete musical range stays available. */
  compactRange?: { low: number; high: number };
  optional?: boolean;
  fieldLabel?: string;
  /** Include a visible label in the same popup hit target as the value. */
  prefix?: string;
  id: string;
  label: string;
  value: number;
  opened: boolean;
  onOpenedChange(open: boolean): void;
  onChange(value: number): void;
}) {
  const input = useRef<HTMLInputElement>(null),
    dropdown = useRef<HTMLDivElement>(null);
  const low = optional ? -1 : choices[0].value;
  const high = choices[choices.length - 1].value;
  const [extended, setExtended] = useState(false);
  const compactLow = compactRange?.low;
  const compactHigh = compactRange?.high;
  const visibleChoices =
    extended || !compactRange
      ? choices
      : choices.filter(
          (note) =>
            note.value >= compactRange.low && note.value <= compactRange.high,
        );
  const visibleEnabled = [
    ...(optional ? [-1] : []),
    ...visibleChoices
      .filter((note) => !note.disabled)
      .map((note) => note.value),
  ];
  const visibleLow = optional ? -1 : (visibleChoices[0]?.value ?? low);
  const visibleHigh = visibleChoices.at(-1)?.value ?? high;
  const enabled = [
    ...(optional ? [-1] : []),
    ...choices.filter((note) => !note.disabled).map((note) => note.value),
  ];
  const octaves = [...new Set(visibleChoices.map((note) => note.octave))];
  const [focusValue, setFocusValue] = useState(value);
  const currentFocus = useRef(focusValue);
  currentFocus.current = focusValue;
  const selected = choices.find((note) => note.value === value);
  useLayoutEffect(() => {
    if (opened && compactLow !== undefined && compactHigh !== undefined)
      setExtended(value < compactLow || value > compactHigh);
  }, [opened, value, compactLow, compactHigh]);
  useLayoutEffect(() => {
    if (!opened) return;
    setFocusValue(value);
    const selected = dropdown.current?.querySelector<HTMLButtonElement>(
      `[data-value="${value}"]`,
    );
    selected?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => {
      // Kept-mounted dropdowns become focusable after their visibility commit.
      // Follow the current roving cell if an arrow key arrived in the meantime.
      const target = dropdown.current?.querySelector<HTMLButtonElement>(
        `[data-value="${currentFocus.current}"]`,
      );
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [opened, value]);
  useEffect(() => {
    const close = () => onOpenedChange(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [onOpenedChange]);
  function chooseEnabled(candidate: number) {
    const direction = candidate >= value ? 1 : -1;
    const next =
      direction > 0
        ? (enabled.find((n) => n >= candidate) ?? enabled[enabled.length - 1])
        : ([...enabled].reverse().find((n) => n <= candidate) ?? enabled[0]);
    if (next !== undefined) onChange(next);
  }
  function choose(next: number) {
    onChange(next);
    onOpenedChange(false);
    input.current?.focus({ preventScroll: true });
  }
  const noteButton = (note: {
    value: number;
    label: string;
    disabled?: boolean;
  }) => (
    <Button
      key={note.value}
      data-value={note.value}
      data-mantine-stop-propagation="true"
      disabled={note.disabled}
      variant={note.value === value ? "light" : "default"}
      size="xs"
      h={rowColumns === columns ? 36 : 44}
      px={0}
      aria-label={note.label}
      title={note.label}
      aria-pressed={note.value === value}
      tabIndex={note.value === focusValue ? 0 : -1}
      // Keep delayed focus-trap activation aligned with arrow-key navigation.
      data-autofocus={note.value === focusValue || undefined}
      onClick={() => choose(note.value)}
      style={{ minWidth: 0 }}
    >
      {note.label}
    </Button>
  );
  const field = (
    <Input
      ref={input}
      id={id}
      role="combobox"
      aria-label={label}
      aria-haspopup="dialog"
      aria-controls={`${id}-picker`}
      aria-expanded={opened}
      readOnly
      data-mantine-stop-propagation={opened ? "true" : undefined}
      value={selected?.label || "None"}
      title={selected?.label || "None"}
      rightSection={
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
        >
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      }
      onClick={() => onOpenedChange(!opened)}
      styles={{ input: { cursor: "pointer" } }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && opened) {
          event.preventDefault();
          event.stopPropagation();
          onOpenedChange(false);
          input.current?.focus({ preventScroll: true });
          return;
        }

        if (
          (event.altKey && event.key === "ArrowDown") ||
          ["F4", "Enter", " "].includes(event.key)
        ) {
          event.preventDefault();
          onOpenedChange(!opened);
          return;
        }
        const steps: Record<string, number> = {
          ArrowUp: 1,
          ArrowDown: -1,
          PageUp: columns,
          PageDown: -columns,
        };
        if (event.key in steps || ["Home", "End"].includes(event.key)) {
          event.preventDefault();
          chooseEnabled(
            event.key === "Home"
              ? low
              : event.key === "End"
                ? high
                : Math.max(low, Math.min(high, value + steps[event.key])),
          );
        }
      }}
    />
  );
  return (
    <Input.Wrapper id={id} label={fieldLabel}>
      <Popover
        id={`${id}-popover`}
        opened={opened}
        // Keep nested focus traps in the same modal subtree, above its scroll body.
        portalProps={{
          target:
            input.current?.closest<HTMLElement>('[aria-modal="true"]') ||
            undefined,
        }}
        onChange={onOpenedChange}
        position="bottom-start"
        offset={8}
        width={
          columns === 12
            ? "min(720px, calc(100vw - 24px))"
            : "min(620px, calc(100vw - 24px))"
        }
        middlewares={{
          flip: true,
          shift: { padding: 12 },
          size: {
            padding: 12,
            // Mantine's default size middleware replaces the inline height cap.
            apply({ availableWidth, availableHeight, elements }) {
              Object.assign(elements.floating.style, {
                maxWidth: `${availableWidth}px`,
                maxHeight: `${Math.max(0, Math.min(availableHeight, window.innerHeight * 0.65))}px`,
              });
            },
          },
        }}
        keepMounted
        keepMountedMode="display-none"
        trapFocus
        withRoles={false}
        returnFocus={false}
        closeOnEscape={false}
        transitionProps={{ duration: 0 }}
      >
        <Popover.Target>
          {prefix ? (
            <label className="pitch-field-trigger" htmlFor={id}>
              <span className="pitch-field-prefix" id={`${id}-label`}>
                {prefix}
              </span>
              <span className="pitch-field-value">{field}</span>
            </label>
          ) : (
            field
          )}
        </Popover.Target>
        <Popover.Dropdown
          id={`${id}-picker`}
          ref={dropdown}
          role="dialog"
          aria-labelledby={undefined}
          aria-label={`Choose ${label.toLowerCase()}`}
          style={{
            overflowY: "auto",
            scrollPaddingTop: compactRange ? 48 : 36,
            maxHeight: "min(65dvh, var(--popover-available-height, 65dvh))",
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onOpenedChange(false);
              input.current?.focus({ preventScroll: true });
              return;
            }
            const target = (event.target as HTMLElement).closest<HTMLElement>(
              "[data-value]",
            );
            const steps: Record<string, number> = {
              ArrowRight: 1,
              ArrowLeft: -1,
              ArrowUp: -rowColumns,
              ArrowDown: rowColumns,
            };
            if (!target || !(event.key in steps)) return;
            event.preventDefault();
            const candidate = Math.max(
              visibleLow,
              Math.min(
                visibleHigh,
                Number(target.dataset.value) + steps[event.key],
              ),
            );
            const next =
              steps[event.key] > 0
                ? (visibleEnabled.find((n) => n >= candidate) ??
                  visibleEnabled[visibleEnabled.length - 1])
                : ([...visibleEnabled].reverse().find((n) => n <= candidate) ??
                  visibleEnabled[0]);
            const button = dropdown.current?.querySelector<HTMLButtonElement>(
              `[data-value="${next}"]`,
            );
            setFocusValue(next);
            if (button) {
              button.focus();
            }
          }}
        >
          <Group
            justify="space-between"
            wrap="nowrap"
            gap="xs"
            mb={compactRange ? "xs" : "sm"}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              background: "var(--mantine-color-body)",
              boxShadow: "0 -12px 0 var(--mantine-color-body)",
              paddingBottom: 4,
            }}
          >
            <Text size="sm" fw={600}>
              {label}
            </Text>
            {compactRange && (
              <Button
                size="compact-xs"
                h={36}
                variant={extended ? "light" : "default"}
                aria-label="Extended range"
                aria-pressed={extended}
                onClick={(event) => {
                  // Safari does not focus clicked buttons; keep focus before removing an active note.
                  event.currentTarget.focus({ preventScroll: true });
                  const next = !extended;
                  setExtended(next);
                  const enabled = choices.filter(
                    (note) =>
                      !note.disabled &&
                      (next ||
                        (note.value >= compactRange.low &&
                          note.value <= compactRange.high)),
                  );
                  if (!enabled.some((note) => note.value === focusValue))
                    setFocusValue(enabled[0]?.value ?? value);
                }}
              >
                Extended range
              </Button>
            )}
          </Group>
          {optional && (
            <div style={{ marginBottom: 8 }}>
              {noteButton({ value: -1, label: "None" })}
            </div>
          )}
          <div
            role="group"
            aria-label="Notes by octave"
            style={{
              display: "grid",
              gridTemplateColumns:
                rowColumns === columns
                  ? `24px repeat(${columns}, minmax(0, 1fr))`
                  : `repeat(${rowColumns}, minmax(0, 1fr))`,
              gap: 4,
              alignItems: "center",
            }}
          >
            {octaves.map((octave) => (
              <div key={octave} style={{ display: "contents" }}>
                <Text
                  size="xs"
                  c="dimmed"
                  ta="center"
                  aria-hidden="true"
                  style={
                    rowColumns === columns
                      ? undefined
                      : { gridColumn: "1 / -1" }
                  }
                >
                  {octave}
                </Text>
                {rowColumns !== columns
                  ? visibleChoices
                      .filter((note) => note.octave === octave)
                      .map(noteButton)
                  : Array.from({ length: columns }, (_, column) => {
                      const note = visibleChoices.find(
                        (note) =>
                          note.octave === octave && note.column === column,
                      );
                      return note ? (
                        noteButton(note)
                      ) : (
                        <span key={`empty-${column}`} />
                      );
                    })}
              </div>
            ))}
          </div>
        </Popover.Dropdown>
      </Popover>
    </Input.Wrapper>
  );
}
