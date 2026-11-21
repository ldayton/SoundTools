import {
  DEFAULT_YEMENITE_COLLECTION,
  YEMENITE_COLLECTIONS,
  selectedCollection,
  collectionChoice,
  type CollectionFamily,
  type YemeniteCollection,
} from './yemenite-collections';
import { useSyncExternalStore } from 'react';
import { Group, Select, Checkbox } from '@mantine/core';
import {
  isPentatonicPattern,
  isGlidePattern,
  SCALE_TUNINGS,
  activeScaleTuning,
  type ScaleTuning,
} from './music';
import type { BuilderModel, SpecPatch } from './builder';

export function ExerciseControls({
  model,
  change,
}: {
  model: BuilderModel;
  change(patch: SpecPatch): void;
}) {
  const { spec } = useSyncExternalStore(model.subscribe, model.getSnapshot);
  if (spec.pattern === 'yemenite') {
    const selected = selectedCollection(spec);
    const extents = Object.entries(YEMENITE_COLLECTIONS).filter(
      ([, item]) => item.family === selected.family
    );
    return (
      <Group
        className="maqamat-controls yemenite-controls"
        justify="center"
        align="flex-end"
        gap={8}
        my="md"
        role="group"
        aria-label="Yemenite controls"
      >
        <Select
          id="yemenite-family"
          label="Collection"
          w={96}
          allowDeselect={false}
          value={selected.family}
          data={[
            { value: 'rast', label: 'Rast' },
            { value: 'bayati', label: 'Bayati' },
            { value: 'sikah', label: 'Sikah' },
          ]}
          comboboxProps={{ withinPortal: true, position: 'bottom-start' }}
          onChange={(value) => {
            if (value)
              change({
                yemeniteCollection: collectionChoice(value as CollectionFamily, selected.extent),
              });
          }}
        />
        <Select
          id="yemenite-extent"
          label="Notes"
          w={60}
          allowDeselect={false}
          disabled={extents.length === 1}
          value={spec.yemeniteCollection ?? DEFAULT_YEMENITE_COLLECTION}
          data={extents.map(([value, item]) => ({ value, label: String(item.extent) }))}
          comboboxProps={{ withinPortal: true, position: 'bottom-start' }}
          onChange={(value) => {
            if (value) change({ yemeniteCollection: value as YemeniteCollection });
          }}
        />
        <Checkbox
          id="tonic-drone"
          label="Tonic drone"
          mb={8}
          checked={!!spec.drone}
          onChange={(event) => change({ drone: event.currentTarget.checked })}
        />
      </Group>
    );
  }
  if (spec.pattern === 'fiveNote' || spec.pattern === 'major')
    return (
      <Group
        className="maqamat-controls"
        justify="center"
        my="md"
        role="group"
        aria-label="Major scale controls"
      >
        <Select
          id="major-notes"
          label="Notes"
          w={140}
          allowDeselect={false}
          value={spec.pattern === 'fiveNote' ? '5' : '8'}
          data={[
            { value: '5', label: '5 notes' },
            { value: '8', label: '8 notes' },
          ]}
          comboboxProps={{ withinPortal: true, position: 'bottom-start' }}
          onChange={(value) => {
            if (value) change({ pattern: value === '5' ? 'fiveNote' : 'major' });
          }}
        />
      </Group>
    );
  if (isPentatonicPattern(spec.pattern))
    return (
      <Group
        className="maqamat-controls"
        justify="center"
        my="md"
        role="group"
        aria-label="Pentatonic controls"
      >
        <Select
          id="pentatonic-notes"
          label="Notes"
          w={140}
          allowDeselect={false}
          value={spec.pattern.replace('pentatonic', '')}
          data={['6', '9', '12'].map((value) => ({ value, label: `${value} notes` }))}
          comboboxProps={{ withinPortal: true, position: 'bottom-start' }}
          onChange={(value) => {
            if (value)
              change({
                pattern: `pentatonic${value}` as 'pentatonic6' | 'pentatonic9' | 'pentatonic12',
              });
          }}
        />
      </Group>
    );
  if (isGlidePattern(spec.pattern))
    return (
      <Group
        className="maqamat-controls"
        justify="center"
        my="md"
        role="group"
        aria-label="Glide controls"
      >
        <Select
          id="glide-interval"
          label="Interval"
          w={140}
          value={spec.pattern === 'octaveGlide' ? 'octave' : 'fifth'}
          allowDeselect={false}
          data={[
            { value: 'fifth', label: 'Fifth' },
            { value: 'octave', label: 'Octave' },
          ]}
          comboboxProps={{ withinPortal: true, position: 'bottom-start' }}
          onChange={(value) => {
            if (value) change({ pattern: value === 'octave' ? 'octaveGlide' : 'fifthGlide' });
          }}
        />
      </Group>
    );
  if (spec.pattern !== 'maqamat') return null;
  return (
    <Group
      className="maqamat-controls"
      justify="center"
      align="flex-end"
      gap="lg"
      my="md"
      role="group"
      aria-label="Maqamat controls"
    >
      <Select
        id="scale-tuning"
        label="Maqam"
        w={140}
        value={activeScaleTuning(spec)}
        data={Object.entries(SCALE_TUNINGS)
          .filter(([value]) => value !== 'major')
          .map(([value, tuning]) => ({ value, label: tuning.name }))}
        onChange={(value) => {
          if (value) change({ scaleTuning: value as ScaleTuning });
        }}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true, position: 'bottom-start' }}
      />
      <Checkbox
        id="tonic-drone"
        label="Tonic drone"
        mb={8}
        checked={!!spec.drone}
        onChange={(event) => change({ drone: event.currentTarget.checked })}
      />
    </Group>
  );
}
