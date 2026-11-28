import { VoiceFeedbackOptions } from './voice-ribbon';
import { isScalePattern, activeScaleTuning } from './music';
import { useSyncExternalStore } from 'react';
import {
  ActionIcon,
  Alert,
  Group,
  NativeSelect,
  Button,
  SimpleGrid,
  Stack,
  Checkbox,
  Divider,
  UnstyledButton,
  Text,
} from '@mantine/core';
import {
  PATTERNS,
  EXERCISE_PATTERNS,
  exerciseFamily,
  isPentatonicPattern,
  isVocalPattern,
  isGlidePattern,
  supportsNoteRepeats,
  exerciseSpan,
  phraseContour,
  phraseLabel,
  progressionRoots,
  noteName,
  noteChoiceLabel,
  type Direction,
  type ExerciseSpec,
} from './music';
import { MIN_NOTE, MAX_NOTE } from './exercise-settings';
import { ToolbarNumber } from '@ldayton/ui/toolbar-number';
import { CommittedNumber } from '@ldayton/ui/committed-number';
import { ResponsivePitchField } from '@ldayton/ui/responsive-pitch-field';
import { useMediaQuery } from '@mantine/hooks';
const COMPACT_PITCH_RANGE = { low: 48, high: 83 }; // C3–B5
export type BuilderSnapshot = { spec: ExerciseSpec; error: string | null };
export type SpecPatch = Partial<ExerciseSpec> & { startingNote?: number };
export interface BuilderModel {
  getSnapshot(): BuilderSnapshot;
  subscribe(listener: () => void): () => void;
}
function PitchField({
  bound,
  value,
  change,
  min,
  max,
}: {
  min: number;
  max: number;
  bound: 'low' | 'high';
  value: number;
  change(value: number): void;
}) {
  const smallPhone = useMediaQuery('(max-width:359px)', undefined, { getInitialValueInEffect: false });
  return (
    <ResponsivePitchField
      id={`${bound}-spin`}
      label={`${bound === 'low' ? 'Lowest' : 'Highest'} note`}
      value={value}
      onChange={change}
      mobileColumns={smallPhone ? 4 : 6}
      compactRange={COMPACT_PITCH_RANGE}
      inlineLabel
      displayLabel={bound === 'low' ? 'Lowest' : 'Highest'}
      choices={Array.from({ length: MAX_NOTE - MIN_NOTE + 1 }, (_, index) => {
        const midi = index + MIN_NOTE;
        return {
          value: midi,
          label: noteChoiceLabel(midi),
          octave: Math.floor(midi / 12) - 1,
          column: midi % 12,
          disabled: midi < min || midi > max,
        };
      })}
    />
  );
}

export function PracticeRange({
  model,
  change,
}: {
  model: BuilderModel;
  change(patch: SpecPatch): void;
}) {
  const { spec } = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <div
      id="note-range"
      className="dorego-range"
      role="group"
      aria-label="Vocal range"
      hidden={!isVocalPattern(spec.pattern)}
    >
      <PitchField
        bound="low"
        value={spec.low}
        change={(low) =>
          change({
            low: Math.min(Math.floor(spec.high - exerciseSpan(spec)), Math.max(MIN_NOTE, low)),
          })
        }
        min={MIN_NOTE}
        max={spec.high - exerciseSpan(spec)}
      />
      <PitchField
        bound="high"
        value={spec.high}
        change={(high) =>
          change({
            high: Math.max(Math.ceil(spec.low + exerciseSpan(spec)), Math.min(MAX_NOTE, high)),
          })
        }
        min={spec.low + exerciseSpan(spec)}
        max={MAX_NOTE}
      />
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
    <Stack id={name} gap="xs" role="group" aria-label={label}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <SimpleGrid cols={choices.length} spacing="xs">
        {choices.map((choice) => (
          <Button
            key={choice.value}
            id={`${name}-${choice.value}`}
            aria-label={choice.label}
            aria-pressed={value === choice.value}
            variant={value === choice.value ? 'light' : 'default'}
            color={value === choice.value ? undefined : 'gray'}
            h="auto"
            py="md"
            px="xs"
            className="dorego-direction"
            onClick={() => change(choice.value)}
          >
            <Stack gap="xs" align="center">
              <Contour values={choice.notes} />
              <Text size="sm" ta="center">
                {choice.label}
              </Text>
            </Stack>
          </Button>
        ))}
      </SimpleGrid>
    </Stack>
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
    isScalePattern(spec.pattern) || isGlidePattern(spec.pattern)
      ? ['up', 'down', 'both']
      : ['up', 'down']
  ) as Direction[];
  const roots = progressionRoots(
    spec.low,
    spec.high - exerciseSpan(spec),
    spec.progression ?? 'up'
  );
  const targets = roots.map((root) =>
    noteName(root + (spec.direction === 'down' ? exerciseSpan(spec) : 0), root)
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
      <Stack gap="lg">
        <VoiceFeedbackOptions />
        <Alert id="form-error" color="red" hidden={!error} role="alert">
          {error}
        </Alert>
        <Stack gap="xs">
          <Divider label="Pitch" labelPosition="left" />
          <div hidden={vocal}>
            <NativeSelect
              id="key"
              disabled={vocal}
              label="Key"
              value={String(spec.direction === 'down' ? spec.high : spec.low)}
              onChange={(event) => change({ startingNote: Number(event.currentTarget.value) })}
            >
              {Array.from({ length: MAX_NOTE - MIN_NOTE + 1 }, (_, i) => MIN_NOTE + i).map(
                (midi) => (
                  <option
                    key={midi}
                    value={midi}
                    disabled={
                      spec.direction === 'down' ? midi < MIN_NOTE + 12 : midi > MAX_NOTE - 12
                    }
                  >
                    {noteChoiceLabel(midi)}
                  </option>
                )
              )}
            </NativeSelect>
          </div>
          <Stack gap="xs" hidden={!vocal}>
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
          </Stack>
        </Stack>
        <Stack gap="sm" hidden={spec.pattern === 'rossini' && roots.length <= 1}>
          <Divider label="Direction" labelPosition="left" />
          <div hidden={spec.pattern === 'rossini'}>
            <DirectionChoices
              name="direction"
              label="Within each round"
              value={spec.direction}
              choices={directions.map((value) => ({
                value,
                label: phraseLabel(spec.pattern, value),
                notes: phraseContour(spec.pattern, value, spec),
              }))}
              change={(direction) => change({ direction })}
            />
          </div>
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
        </Stack>
        <Stack id="practice-timing-options" gap="lg">
          <Stack gap="sm" hidden={!vocal || activeScaleTuning(spec) !== 'major' || spec.pattern === 'yemenite'}>
            <Divider label="Accompaniment" labelPosition="left" />
            <Checkbox
              id="startingChords"
              label="Starting-note chords"
              checked={spec.startingChords ?? true}
              onChange={(event) => change({ startingChords: event.currentTarget.checked })}
            />
          </Stack>
          <Stack gap="sm" hidden={spec.pattern === 'arpeggio' || (isGlidePattern(spec.pattern) && !supportsNoteRepeats(spec.pattern))}>
          <Divider label="Phrase variations" labelPosition="left" />
          <div hidden={isGlidePattern(spec.pattern) || spec.pattern === 'arpeggio'}>
            <Checkbox
              id="repeatTwice"
              label="Repeat each round twice"
              checked={!!spec.repeatTwice}
              onChange={(event) => change({ repeatTwice: event.currentTarget.checked })}
            />
          </div>
          <Stack id="note-repeats" gap="xs" hidden={spec.pattern === 'arpeggio' || !supportsNoteRepeats(spec.pattern)}>
            <Group wrap="nowrap" justify="space-between">
              <Checkbox
                id="repeatTurn"
                label={spec.direction === 'down' ? 'Repeat lowest note' : 'Repeat highest note'}
                checked={!!spec.repeatTurn}
                onChange={(event) => change({ repeatTurn: event.currentTarget.checked })}
              />
              <div style={{ flexShrink: 0 }}>
                <ToolbarNumber
                  id="repeatTurnCount"
                  disabled={!spec.repeatTurn}
                  label={spec.direction === 'down' ? 'Lowest note count' : 'Highest note count'}
                  icon={null}
                  unit=""
                  min={2}
                  max={8}
                  value={spec.repeatTurnCount ?? 4}
                  onChange={(value) => change({ repeatTurnCount: value })}
                />
              </div>
            </Group>
            <Group wrap="nowrap" justify="space-between">
              <Checkbox
                id="repeatHome"
                label="Repeat home note"
                checked={!!spec.repeatHome}
                onChange={(event) => change({ repeatHome: event.currentTarget.checked })}
              />
              <div style={{ flexShrink: 0 }}>
                <ToolbarNumber
                  id="repeatHomeCount"
                  disabled={!spec.repeatHome}
                  label="Home note count"
                  icon={null}
                  unit=""
                  min={2}
                  max={8}
                  value={spec.repeatHomeCount ?? 4}
                  onChange={(value) => change({ repeatHomeCount: value })}
                />
              </div>
            </Group>
          </Stack>
          </Stack>
          <Stack gap="sm">
          <Divider label="Session timing" labelPosition="left" />
          <SimpleGrid cols={1}>
            {[
              {
                id: 'repeat',
                label: 'Extra rounds',
                value: spec.repetitions - 1,
                max: 15,
                patch: (value: number) => ({ repetitions: value + 1 }),
              },
              {
                id: 'rest',
                label: 'Rest between rounds (beats)',
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
                  <Group wrap="nowrap" justify="space-between">
                    <Text component="label" htmlFor={`${field.id}-mobile`} size="sm" fw={500}>{field.label}</Text>
                    <div style={{ flexShrink: 0 }}><ToolbarNumber id={`${field.id}-mobile`} label={field.label} icon={null} unit="" min={0} max={field.max} value={field.value} onChange={(value) => change(field.patch(value))} /></div>
                  </Group>
                </div>
              </div>
            ))}
          </SimpleGrid>
          <div className="dorego-desktop-count">
          <NativeSelect
            id="countIn"
            label="Count-in"
            value={String(spec.countIn)}
            data={[
              { value: '0', label: 'None' },
              { value: '2', label: '½ bar' },
              { value: '4', label: '1 bar' },
              { value: '8', label: '2 bars' },
            ]}
            onChange={(event) => change({ countIn: Number(event.currentTarget.value) })}
          />
          </div>
          <div className="dorego-mobile-count">
            <Group wrap="nowrap" justify="space-between">
              <Text component="label" htmlFor="countIn-mobile" size="sm" fw={500}>Count-in (beats)</Text>
              <div style={{ flexShrink: 0 }}><ToolbarNumber id="countIn-mobile" label="Count-in (beats)" icon={null} unit="" min={0} max={8} value={spec.countIn} onChange={(value) => change({ countIn: value })} /></div>
            </Group>
          </div>
          </Stack>
        </Stack>
      </Stack>
    </form>
  );
}

export function ExerciseSelection({
  model,
  change,
  active = true,
}: {
  model: BuilderModel;
  change(patch: SpecPatch): void;
  active?: boolean;
}) {
  const { spec } = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Stack gap={2} role="group" aria-label="Exercise selection">
      {EXERCISE_PATTERNS.map((value) => (
        <UnstyledButton
          key={value}
          data-pattern={value}
          aria-current={
            active && exerciseFamily(spec.pattern) === value
              ? 'true'
              : undefined
          }
          className="dorego-exercise"
          onClick={() =>
            change({
              pattern:
                exerciseFamily(spec.pattern) === value
                  ? spec.pattern
                  : value,
            })
          }
        >
          {PATTERNS[value].name}
        </UnstyledButton>
      ))}
    </Stack>
  );
}
