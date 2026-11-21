import type { Records, Json } from '@ldayton/account';
import { checkSchema } from '@ldayton/account/model';
import { DEFAULT_SPEC, type ExerciseSpec } from './music';
import { restoreSpec } from './exercise-settings';
import { breathSettings } from './breath-squares';
type State = {
  spec: ExerciseSpec;
  breathing: { rounds: number; seconds: number };
  channels: 'stereo' | 'mono';
  selected: 'warmup' | 'breathSquares';
};
function guest(): State {
  const read = (key: string) => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  };
  let spec: ExerciseSpec;
  try {
    spec = restoreSpec(read('dorego.current'), localStorage.getItem('dorego.glideShapeVersion'));
  } catch {
    spec = { ...DEFAULT_SPEC, progression: 'up' };
  }
  let channels = 'stereo',
    selected = 'warmup';
  try {
    channels = localStorage.getItem('dorego.audioChannels') || channels;
    selected = localStorage.getItem('dorego.exercise') || selected;
  } catch {}
  return {
    spec,
    breathing: breathSettings(read('dorego.breathSquares')),
    channels: channels === 'mono' ? 'mono' : 'stereo',
    selected: selected === 'breathSquares' ? 'breathSquares' : 'warmup',
  };
}
const pitchFields = [
  'pattern',
  'key',
  'low',
  'high',
  'direction',
  'progression',
  'yemeniteCollection',
] as const;
export function encodePreferences(state: State): Records {
  return {
    schema: 1,
    ...Object.fromEntries(
      Object.entries(state.spec)
        .filter(([key]) => !pitchFields.includes(key as any))
        .map(([key, value]) => ['exercise.' + key, value as Json])
    ),
    'exercise.pitch': Object.fromEntries(
      pitchFields.flatMap((key) => (state.spec[key] === undefined ? [] : [[key, state.spec[key]]]))
    ) as Json,
    breathing: state.breathing,
    channels: state.channels,
    selected: state.selected,
  };
}
export const preferences = {
  state: guest(),
  cloud: false,
  listeners: new Set<(source: 'local' | 'account') => void>(),
  subscribe(listener: (source: 'local' | 'account') => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  },
  update(patch: Partial<State>) {
    const next = { ...this.state, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.state = next;
    if (!this.cloud)
      try {
        localStorage.setItem('dorego.current', JSON.stringify(next.spec));
        localStorage.setItem('dorego.glideShapeVersion', '1');
        localStorage.setItem('dorego.breathSquares', JSON.stringify(next.breathing));
        localStorage.setItem('dorego.audioChannels', next.channels);
        localStorage.setItem('dorego.exercise', next.selected);
      } catch {}
    for (const listener of this.listeners) listener('local');
  },
  apply(records: Records | null) {
    if (!records) this.state = guest();
    else {
      this.state = decodePreferences(records);
    }
    this.cloud = records !== null;
    for (const listener of this.listeners) listener('account');
  },
};

export function decodePreferences(records: Records): State {
  checkSchema(records);
  const raw = Object.fromEntries(
    Object.entries(records)
      .filter(([key]) => key.startsWith('exercise.') && key !== 'exercise.pitch')
      .map(([key, value]) => [key.slice(9), value])
  );
  const pitch = records['exercise.pitch'];
  const spec = restoreSpec({ ...raw, ...(pitch && typeof pitch === 'object' ? pitch : {}) }, '1');
  return {
    spec,
    breathing: breathSettings(records.breathing),
    channels: records.channels === 'mono' ? 'mono' : 'stereo',
    selected: records.selected === 'breathSquares' ? 'breathSquares' : 'warmup',
  };
}
