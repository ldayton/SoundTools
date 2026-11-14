import { useEffect, useLayoutEffect, useRef } from 'react';
import { Button, Input, Popover, Text } from '@mantine/core';
import { noteChoiceLabel } from './note-spelling';
const columns = 12,
  low = 24,
  high = 96;
const choices = Array.from({ length: high - low + 1 }, (_, index) => {
  const value = low + index;
  return {
    value,
    label: noteChoiceLabel(value),
    octave: Math.floor(value / 12) - 1,
    column: value % 12,
  };
});
const octaves = [...new Set(choices.map((note) => note.octave))];
/** A musical grid with standard field chrome, placement, dismissal and focus trapping. */
export function PitchPicker({
  id,
  label,
  value,
  opened,
  onOpenedChange,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  opened: boolean;
  onOpenedChange(open: boolean): void;
  onChange(value: number): void;
}) {
  const input = useRef<HTMLInputElement>(null),
    dropdown = useRef<HTMLDivElement>(null);
  const selected = choices.find((note) => note.value === value);
  useLayoutEffect(() => {
    if (!opened) return;
    const selected = dropdown.current?.querySelector<HTMLButtonElement>(`[data-value="${value}"]`);
    selected?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() =>
      selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    );
    return () => cancelAnimationFrame(frame);
  }, [opened, value]);
  useEffect(() => {
    const close = () => onOpenedChange(false);
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [onOpenedChange]);
  function choose(next: number) {
    onChange(next);
    onOpenedChange(false);
    input.current?.focus({ preventScroll: true });
  }
  const noteButton = (note: { value: number; label: string }) => (
    <Button
      key={note.value}
      data-value={note.value}
      variant={note.value === value ? 'light' : 'default'}
      size="xs"
      h={36}
      px={0}
      aria-label={note.label}
      title={note.label}
      aria-pressed={note.value === value}
      tabIndex={note.value === value ? 0 : -1}
      data-autofocus={note.value === value || undefined}
      onClick={() => choose(note.value)}
      style={{ minWidth: 0 }}
    >
      {note.label}
    </Button>
  );
  return (
    <Popover
      id={`${id}-popover`}
      opened={opened}
      onChange={onOpenedChange}
      position="bottom-start"
      offset={8}
      width="min(720px, calc(100vw - 24px))"
      middlewares={{ flip: true, shift: { padding: 12 }, size: true }}
      keepMounted
      keepMountedMode="display-none"
      trapFocus
      withRoles={false}
      returnFocus={false}
      closeOnEscape={false}
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        <Input
          ref={input}
          id={id}
          role="combobox"
          aria-label={label}
          aria-haspopup="dialog"
          aria-controls={`${id}-picker`}
          aria-expanded={opened}
          readOnly
          value={selected?.label || 'None'}
          title={selected?.label || 'None'}
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
          styles={{ input: { cursor: 'pointer' } }}
          onKeyDown={(event) => {
            if (
              (event.altKey && event.key === 'ArrowDown') ||
              ['F4', 'Enter', ' '].includes(event.key)
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
            if (event.key in steps || ['Home', 'End'].includes(event.key)) {
              event.preventDefault();
              onChange(
                event.key === 'Home'
                  ? low
                  : event.key === 'End'
                    ? high
                    : Math.max(low, Math.min(high, value + steps[event.key]))
              );
            }
          }}
        />
      </Popover.Target>
      <Popover.Dropdown
        id={`${id}-picker`}
        ref={dropdown}
        role="dialog"
        aria-labelledby={undefined}
        aria-label={`Choose ${label.toLowerCase()}`}
        style={{
          overflowY: 'auto',
          maxHeight: 'min(65dvh, var(--popover-available-height, 65dvh))',
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onOpenedChange(false);
            input.current?.focus({ preventScroll: true });
            return;
          }
          const target = (event.target as HTMLElement).closest<HTMLElement>('[data-value]');
          const steps: Record<string, number> = {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowUp: -columns,
            ArrowDown: columns,
          };
          if (!target || !(event.key in steps)) return;
          event.preventDefault();
          const next = Math.max(
            low,
            Math.min(high, Number(target.dataset.value) + steps[event.key])
          );
          const button = dropdown.current?.querySelector<HTMLButtonElement>(
            `[data-value="${next}"]`
          );
          target.tabIndex = -1;
          if (button) {
            button.tabIndex = 0;
            button.focus();
          }
        }}
      >
        <Text size="sm" fw={600} mb="sm">
          {label}
        </Text>
        <div
          role="group"
          aria-label="Notes by octave"
          style={{
            display: 'grid',
            gridTemplateColumns: `24px repeat(${columns}, minmax(0, 1fr))`,
            gap: 4,
            alignItems: 'center',
          }}
        >
          {octaves.map((octave) => (
            <div key={octave} style={{ display: 'contents' }}>
              <Text size="xs" c="dimmed" ta="center" aria-hidden="true">
                {octave}
              </Text>
              {Array.from({ length: columns }, (_, column) => {
                const note = choices.find(
                  (note) => note.octave === octave && note.column === column
                );
                return note ? noteButton(note) : <span key={`empty-${column}`} />;
              })}
            </div>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
