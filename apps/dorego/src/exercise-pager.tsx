import { useMemo, type ReactNode } from 'react';
import { Button, Group, Text, Title } from '@mantine/core';
import { SwipePager } from '@ldayton/ui/swipe-pager';
import { ControlIcon, type ControlIconName } from '@ldayton/ui/control-icon';
import { editSpec } from './exercise-settings';
import {
  EXERCISE_PATTERNS,
  PATTERNS,
  exerciseFamily,
  generateExercise,
  roundNoteName,
  secondsAt,
  type ExerciseSpec,
  type Pattern,
} from './music';
import { phrasePitches, practiceRange } from './keyboard-layout';

export type ExercisePage = Pattern | 'breathSquares';

/** Inactive pages are read-only previews: they create no audio or live controls. */
function ExercisePreview({ spec, pattern }: { spec: ExerciseSpec; pattern: Pattern }) {
  const exercise = useMemo(
    () => generateExercise(editSpec(spec, { pattern }), Infinity),
    [spec, pattern]
  );
  const round = exercise.rounds[0],
    next = exercise.rounds[1];
  const range = practiceRange(exercise, round);
  const pitches = phrasePitches(exercise, round);
  const columns = Math.min(pitches.length, pitches.length > 5 ? 4 : 5);
  const duration = Math.round(secondsAt(exercise.totalBeats, exercise.spec.bpm));
  return (
    <section className="exercise-page-preview" aria-hidden="true">
      <Title order={1} size="h3" ta="center">
        {exercise.title}
      </Title>
      <Text size="xs" c="dimmed" ta="center" mt={4}>
        Round 1 of {exercise.rounds.length} · 0:00 / {Math.floor(duration / 60)}:
        {String(duration % 60).padStart(2, '0')}
      </Text>
      <div className="exercise-preview-readout">
        <Text size="xs" c="dimmed" ta="center">
          READY
        </Text>
        <div className="exercise-preview-pair">
          <div>
            <span>CURRENT</span>
            <strong>{roundNoteName(round.midi, round)}</strong>
            <small>
              {roundNoteName(range.low, round)} – {roundNoteName(range.high, round)}
            </small>
          </div>
          {next && (
            <div>
              <span>NEXT</span>
              <strong>{roundNoteName(next.midi, next)}</strong>
            </div>
          )}
        </div>
      </div>
      <Group className="exercise-preview-actions" gap={6} wrap="nowrap" justify="center">
        {(
          [
            'go-start',
            'chevron-left',
            'play',
            'chevron-right',
            'refresh',
          ] satisfies ControlIconName[]
        ).map((icon, index) => (
          <Button
            key={icon}
            tabIndex={-1}
            variant={index === 2 ? 'filled' : index === 4 ? 'light' : 'default'}
            px={0}
          >
            <ControlIcon name={icon} />
          </Button>
        ))}
      </Group>
      <div
        className="exercise-preview-pads"
        style={{ gridTemplateColumns: `repeat(${columns * 2}, minmax(0, 1fr))` }}
      >
        {pitches.map((pitch, index) => (
          <span
            key={pitch}
            style={{
              gridColumn: `${(index % columns) * 2 + 1 + (Math.floor(index / columns) === Math.floor((pitches.length - 1) / columns) && pitches.length % columns ? columns - (pitches.length % columns) : 0)} / span 2`,
              gridRow: Math.floor(index / columns) + 1,
            }}
          >
            {roundNoteName(pitch, round)}
          </span>
        ))}
      </div>
    </section>
  );
}

export function ExercisePager({
  spec,
  selected,
  practice,
  breathing,
  blocked,
  select,
}: {
  spec: ExerciseSpec;
  selected: 'warmup' | 'breathSquares';
  practice: ReactNode;
  breathing: ReactNode;
  blocked: boolean;
  select(page: ExercisePage): void;
}) {
  const value = selected === 'breathSquares' ? 'breathSquares' : exerciseFamily(spec.pattern);
  const order: readonly ExercisePage[] = [...EXERCISE_PATTERNS, 'breathSquares'];
  const index = order.indexOf(value);
  return (
    <div className="dorego-exercise-pager">
      <SwipePager
        value={value}
        blocked={blocked}
        onChange={(id) => select(id as ExercisePage)}
        pages={order.map((id, pageIndex) => ({
          id,
          content:
            id === value ? (
              id === 'breathSquares' ? (
                breathing
              ) : (
                practice
              )
            ) : id !== 'breathSquares' && Math.abs(pageIndex - index) === 1 ? (
              <ExercisePreview spec={spec} pattern={id} />
            ) : (
              <div className="exercise-page-preview" aria-hidden="true">
                <Title order={1} size="h3" ta="center">
                  {id === 'breathSquares' ? 'Breath Squares' : PATTERNS[id].name}
                </Title>
              </div>
            ),
        }))}
      />
    </div>
  );
}
