import { Fragment, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Button, Popover, Text } from "@mantine/core";
import { createViewState } from "./view-state";
import { RetainedContent } from "./retained-content";
export const pitchPickerState = createViewState<{
  value: number;
  open: boolean;
}>;
/** The pitch grid is domain-specific; Mantine owns placement, focus and dismissal. */
export function PitchPicker({
  model,
  field,
  input,
  button,
  positions,
  chromatic,
  optional,
  commit,
}: {
  model: ReturnType<typeof pitchPickerState>;
  field: HTMLElement;
  input: HTMLInputElement;
  button: HTMLButtonElement;
  positions: readonly string[];
  chromatic?: boolean;
  optional?: boolean;
  commit(index: number): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const dropdown = useRef<HTMLDivElement>(null);
  const title = input.getAttribute("aria-label")!;
  const octaves = [
    ...new Set(positions.map((note) => Number(note.match(/-?\d+$/)![0]))),
  ];
  const letters = chromatic
    ? ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
    : [..."CDEFGAB"];
  useLayoutEffect(() => {
    for (const element of [input, button])
      element.setAttribute("aria-expanded", String(state.open));
    if (!state.open) return;
    const selected = dropdown.current?.querySelector<HTMLButtonElement>(
      `[data-position="${state.value}"]`,
    );
    selected?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() =>
      selected?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [state.open, state.value, input, button]);
  function choose(index: number) {
    commit(index);
    input.focus({ preventScroll: true });
  }
  const noteButton = (index: number, label: string) => (
    <Button
      key={index}
      variant={state.value === index ? "light" : "default"}
      size="xs"
      px={0}
      h={36}
      data-position={index}
      data-autofocus={state.value === index || undefined}
      aria-label={label}
      title={label}
      aria-pressed={state.value === index}
      tabIndex={state.value === index ? 0 : -1}
      onClick={() => choose(index)}
    >
      {label}
    </Button>
  );
  return (
    <Popover
      id={`${input.id}-popover`}
      opened={state.open}
      onChange={(open) => model.set({ ...model.getSnapshot(), open })}
      position="bottom-start"
      offset={8}
      keepMounted
      width={
        chromatic
          ? "min(720px, calc(100vw - 24px))"
          : "min(620px, calc(100vw - 24px))"
      }
      middlewares={{ flip: true, shift: { padding: 12 }, size: true }}
      trapFocus
      returnFocus={false}
      closeOnEscape={false}
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        <div className="note-picker-anchor">
          <RetainedContent element={field} />
        </div>
      </Popover.Target>
      <Popover.Dropdown
        id={`${input.id}-picker`}
        ref={dropdown}
        className={`note-picker soundtools-ui${chromatic ? " is-chromatic" : ""}`}
        role="dialog"
        aria-labelledby={undefined}
        aria-label={`Choose ${title.toLowerCase()}`}
        onKeyDown={(event) => {
          // The retained composite field has two focus targets; return to its input.
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            model.set({ ...model.getSnapshot(), open: false });
            input.focus({ preventScroll: true });
            return;
          }

          const selected = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-position]",
          );
          const steps: Record<string, number> = {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowUp: -letters.length,
            ArrowDown: letters.length,
          };
          if (!selected || !(event.key in steps)) return;
          event.preventDefault();
          const index = Math.max(
            optional ? -1 : 0,
            Math.min(
              positions.length - 1,
              Number(selected.dataset.position) + steps[event.key],
            ),
          );
          const next = dropdown.current?.querySelector<HTMLButtonElement>(
            `[data-position="${index}"]`,
          );
          selected.tabIndex = -1;
          if (next) {
            next.tabIndex = 0;
            next.focus();
          }
        }}
      >
        <Text size="sm" fw={600} mb="sm">
          {title}
        </Text>
        {optional && noteButton(-1, "None")}
        <div
          className="note-picker-grid"
          role="group"
          aria-label="Notes by octave"
        >
          {octaves.map((octave) => (
            <Fragment key={octave}>
              <span className="note-picker-octave" aria-hidden="true">
                {octave}
              </span>
              {letters.map((letter) => {
                const note = letter + octave;
                const index = positions.indexOf(note);
                return index < 0 ? (
                  <span key={note} />
                ) : (
                  noteButton(index, note)
                );
              })}
            </Fragment>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
