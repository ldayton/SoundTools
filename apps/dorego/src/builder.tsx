import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Accordion,
  ActionIcon,
  Alert,
  Group,
  NativeSelect,
  NumberInput,
  Radio,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import {
  PATTERNS,
  isVocalPattern,
  isGlidePattern,
  supportsNoteRepeats,
  vocalSpan,
  phraseContour,
  phraseLabel,
  progressionRoots,
  noteName,
  noteChoiceLabel,
  type Direction,
  type ExerciseSpec,
} from './music';
import { NoteWheel } from './note-wheel';
import { NotePicker } from './note-picker';
export type BuilderSnapshot = { spec: ExerciseSpec; error: string | null };
export type SpecPatch = Partial<ExerciseSpec> & { startingNote?: number };
export interface BuilderModel {
  getSnapshot(): BuilderSnapshot;
  subscribe(listener: () => void): () => void;
}
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
  useEffect(() => {
    current.current = value;
    setDraft(value);
  }, [value]);
  function commit() {
    const next =
      typeof current.current === 'number' && Number.isFinite(current.current)
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
      aria-valuenow={typeof draft === 'number' ? draft : undefined}
      onValueChange={(values, info) => {
        if (
          ['increment', 'decrement'].includes(info.source as string) &&
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
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
function PitchField({
  bound,
  value,
  change,
}: {
  bound: 'low' | 'high';
  value: number;
  change(value: number): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<{ picker: NotePicker; wheel: NoteWheel }>(null);
  const changed = useRef(change);
  changed.current = change;
  useLayoutEffect(() => {
    const node = host.current!;
    const label = bound === 'low' ? 'Lowest' : 'Highest';
    node.innerHTML = `<div class="desktop-note"><input id="${bound}-spin" type="text" role="combobox" aria-label="${label} note" readonly/><button type="button" id="${bound}-choose" aria-label="Choose ${label.toLowerCase()} note">⌄</button></div><div class="note-spinner mobile-note"><div class="note-wheel-selection" aria-hidden="true"></div><div id="${bound}-wheel" class="note-wheel" role="spinbutton" tabindex="0" aria-label="${label} note" aria-valuemin="24" aria-valuemax="96"></div></div>`;
    const picker = new NotePicker(
      node.querySelector('input')!,
      node.querySelector('button')!,
      (midi) => changed.current(midi)
    );
    const wheel = new NoteWheel(node.querySelector('.note-wheel')!, (midi) =>
      changed.current(midi)
    );
    const target = node.querySelector<HTMLElement>('.note-wheel')!;
    target.addEventListener('keydown', (event) => {
      const steps: Record<string, number> = {
        ArrowUp: 1,
        ArrowRight: 1,
        ArrowDown: -1,
        ArrowLeft: -1,
        PageUp: 12,
        PageDown: -12,
      };
      if (event.key in steps || ['Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        changed.current(
          event.key === 'Home'
            ? 24
            : event.key === 'End'
              ? 96
              : Math.max(
                  24,
                  Math.min(
                    96,
                    Number(target.getAttribute('aria-valuenow')) + (steps[event.key] || 0)
                  )
                )
        );
      }
    });
    controls.current = { picker, wheel };
  }, [bound]);
  useLayoutEffect(() => {
    controls.current?.picker.setValue(value);
    controls.current?.wheel.setValue(value);
  }, [value]);
  return (
    <div>
      <Text size="sm" fw={500} mb={4}>
        {bound === 'low' ? 'Lowest' : 'Highest'}
      </Text>
      <div ref={host} />
    </div>
  );
}
function Contour({ values }: { values: readonly number[] }) {
  const max = Math.max(...values, 1);
  const outline = values.filter(
    (note, index) =>
      index === 0 ||
      index === values.length - 1 ||
      Math.sign(note - values[index - 1]) !== Math.sign(values[index + 1] - note)
  );
  const points = outline
    .map(
      (note, index) =>
        `${4 + (index * 56) / Math.max(1, outline.length - 1)},${21 - (note * 18) / max}`
    )
    .join(' ');
  return (
    <svg
      viewBox="0 0 64 24"
      width="64"
      height="24"
      aria-hidden="true"
      style={{
        width: 56,
        maxWidth: '100%',
        height: 24,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      <polyline points={points} />
    </svg>
  );
}
function DirectionChoices({
  name,
  label,
  value,
  choices,
  change,
}: {
  name: string;
  label: string;
  value: Direction;
  choices: { value: Direction; label: string; notes: readonly number[] }[];
  change(value: Direction): void;
}) {
  return (
    <Radio.Group
      id={name}
      name={name}
      label={label}
      value={value}
      onChange={(value) => change(value as Direction)}
    >
      <SimpleGrid cols={choices.length} spacing="xs" mt="xs">
        {choices.map((choice) => (
          <Radio.Card
            key={choice.value}
            id={`${name}-${choice.value}`}
            value={choice.value}
            aria-label={choice.label}
            p="xs"
            style={{ minWidth: 0 }}
          >
            <Stack gap={4} align="center">
              <Contour values={choice.notes} />
              <Group gap={4} wrap="nowrap">
                <Radio.Indicator size="xs" />
                <Text size="xs" ta="center">
                  {choice.label}
                </Text>
              </Group>
            </Stack>
          </Radio.Card>
        ))}
      </SimpleGrid>
    </Radio.Group>
  );
}
export function Builder({
  model,
  change,
  transpose,
}: {
  model: BuilderModel;
  change(patch: SpecPatch): void;
  transpose(step: number): void;
}) {
  const { spec, error } = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const vocal = isVocalPattern(spec.pattern);
  const directions = (
    spec.pattern === 'major' || isGlidePattern(spec.pattern)
      ? ['up', 'down', 'both']
      : ['up', 'down']
  ) as Direction[];
  const roots = progressionRoots(
    spec.low,
    spec.high - vocalSpan(spec.pattern),
    spec.progression ?? 'up'
  );
  const targets = roots.map((root) =>
    noteName(root + (spec.direction === 'down' ? vocalSpan(spec.pattern) : 0), root)
  );
  const preview =
    targets.length <= 5
      ? targets.join(' → ')
      : spec.progression === 'both'
        ? `${targets[0]} → … → ${targets[Math.floor(targets.length / 2)]} → … → ${targets[targets.length - 1]}`
        : `${targets.slice(0, 3).join(' → ')} → … → ${targets[targets.length - 1]}`;
  return (
    <form
      id="exercise-form"
      className="dorego-builder-ui"
      onSubmit={(event) => event.preventDefault()}
    >
      <Stack>
        <NativeSelect
          id="pattern"
          label="Exercise"
          value={spec.pattern}
          data={Object.entries(PATTERNS).map(([value, pattern]) => ({
            value,
            label: pattern.name,
          }))}
          onChange={(event) =>
            change({ pattern: event.currentTarget.value as ExerciseSpec['pattern'] })
          }
        />
        <Alert id="form-error" color="red" hidden={!error} role="alert">
          {error}
        </Alert>
        <div hidden={vocal}>
          <NativeSelect
            id="key"
            disabled={vocal}
            label="Key"
            value={String(spec.direction === 'down' ? spec.high : spec.low)}
            onChange={(event) => change({ startingNote: Number(event.currentTarget.value) })}
          >
            {Array.from({ length: 73 }, (_, i) => 24 + i).map((midi) => (
              <option
                key={midi}
                value={midi}
                disabled={spec.direction === 'down' ? midi < 36 : midi > 84}
              >
                {noteChoiceLabel(midi)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div hidden={spec.pattern === 'rossini'}>
          <DirectionChoices
            name="direction"
            label="Within each round"
            value={spec.direction}
            choices={directions.map((value) => ({
              value,
              label: phraseLabel(spec.pattern, value),
              notes: phraseContour(spec.pattern, value),
            }))}
            change={(direction) => change({ direction })}
          />
        </div>
        <Stack id="note-range" gap="xs" hidden={!vocal}>
          <Group id="range-heading" justify="space-between">
            <Text size="sm" fw={500}>
              Range
            </Text>
            <Group gap={4}>
              <ActionIcon
                id="transpose-down"
                variant="default"
                aria-label="Transpose down one semitone"
                onClick={() => transpose(-1)}
              >
                −
              </ActionIcon>
              <ActionIcon
                id="transpose-up"
                variant="default"
                aria-label="Transpose up one semitone"
                onClick={() => transpose(1)}
              >
                +
              </ActionIcon>
            </Group>
          </Group>
          <SimpleGrid cols={2}>
            <PitchField bound="low" value={spec.low} change={(low) => change({ low })} />
            <PitchField bound="high" value={spec.high} change={(high) => change({ high })} />
          </SimpleGrid>
        </Stack>
        <div hidden={spec.pattern === 'major' || roots.length <= 1}>
          <DirectionChoices
            name="progression"
            label="Between rounds"
            value={spec.progression ?? 'up'}
            choices={[
              { value: 'up', label: 'Rising', notes: [0, 1] },
              { value: 'down', label: 'Falling', notes: [1, 0] },
              { value: 'both', label: 'Rising then falling', notes: [0, 1, 0] },
            ]}
            change={(progression) => change({ progression })}
          />
          <Text id="progression-preview" size="xs" c="dimmed" ta="center" mt="xs">
            {targets.length === 1 ? `${targets[0]} · one key` : preview}
          </Text>
        </div>
        <Accordion id="dorego-more" keepMounted keepMountedMode="display-none">
          <Accordion.Item value="more">
            <Accordion.Control>More options</Accordion.Control>
            <Accordion.Panel>
              <Stack>
                <Switch
                  id="startingChords"
                  label="Starting-note chords"
                  checked={spec.startingChords ?? true}
                  hidden={!vocal}
                  onChange={(event) => change({ startingChords: event.currentTarget.checked })}
                />
                <Switch
                  id="repeatTwice"
                  label="Repeat each round twice"
                  checked={!!spec.repeatTwice}
                  hidden={isGlidePattern(spec.pattern)}
                  onChange={(event) => change({ repeatTwice: event.currentTarget.checked })}
                />
                <Stack id="note-repeats" gap="xs" hidden={!supportsNoteRepeats(spec.pattern)}>
                  <Text size="sm" fw={500}>
                    Repeat notes
                  </Text>
                  <Switch
                    id="repeatTurn"
                    label={spec.direction === 'down' ? 'Lowest note' : 'Highest note'}
                    checked={!!spec.repeatTurn}
                    onChange={(event) => change({ repeatTurn: event.currentTarget.checked })}
                  />
                  <Switch
                    id="repeatHome"
                    label="Home note on return"
                    checked={!!spec.repeatHome}
                    onChange={(event) => change({ repeatHome: event.currentTarget.checked })}
                  />
                </Stack>
                <SimpleGrid cols={2}>
                  {[
                    {
                      id: 'repeat',
                      label: 'Repeats',
                      value: spec.repetitions - 1,
                      max: 15,
                      patch: (value: number) => ({ repetitions: value + 1 }),
                    },
                    {
                      id: 'rest',
                      label: 'Rest (beats)',
                      value: spec.restBeats,
                      max: 16,
                      patch: (value: number) => ({ restBeats: value }),
                    },
                  ].map((field) => (
                    <div key={field.id}>
                      <div className="dorego-desktop-count">
                        <CommittedNumber
                          id={`${field.id}-count`}
                          label={field.label}
                          min={0}
                          max={field.max}
                          value={field.value}
                          change={(value) => change(field.patch(value))}
                        />
                      </div>
                      <div className="dorego-mobile-count">
                        <NativeSelect
                          id={`${field.id}-select`}
                          label={field.label}
                          value={String(field.value)}
                          data={[
                            ...Array.from({ length: 9 }, (_, i) => i),
                            ...(field.value > 8 ? [field.value] : []),
                          ].map((value) => ({
                            value: String(value),
                            label: value ? String(value) : 'None',
                          }))}
                          onChange={(event) =>
                            change(field.patch(Number(event.currentTarget.value)))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </SimpleGrid>
                <NativeSelect
                  id="countIn"
                  label="Count-in"
                  value={String(spec.countIn)}
                  data={[
                    { value: '0', label: '0 bars' },
                    { value: '2', label: '½ bar' },
                    { value: '4', label: '1 bar' },
                    { value: '8', label: '2 bars' },
                  ]}
                  onChange={(event) => change({ countIn: Number(event.currentTarget.value) })}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </form>
  );
}
