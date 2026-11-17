import { createViewState } from '@ldayton/ui/view-state';

export const BREATH_STEPS = ['Inhale', 'Hold', 'Exhale', 'Hold'] as const;
export type BreathSettings = { rounds: number; seconds: number };
export const DEFAULT_BREATH_SETTINGS: BreathSettings = { rounds: 4, seconds: 4 };
export function breathSettings(input: unknown): BreathSettings {
  const value = input as Partial<BreathSettings> | null;
  const valid = (n: unknown, max: number, fallback: number) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= max ? n : fallback;
  return {
    rounds: valid(value?.rounds, 100, DEFAULT_BREATH_SETTINGS.rounds),
    seconds: valid(value?.seconds, 60, DEFAULT_BREATH_SETTINGS.seconds),
  };
}
export type BreathSnapshot = {
  settings: BreathSettings;
  mode: 'ready' | 'playing' | 'paused' | 'complete';
  position: number;
  error: string | null;
};
export function breathAt(state: BreathSnapshot) {
  const { settings, position, mode } = state;
  const duration = settings.rounds * settings.seconds * 4;
  const step = Math.min(settings.rounds * 4 - 1, Math.floor(position / settings.seconds));
  const progress = Math.min(1, (position - step * settings.seconds) / settings.seconds);
  return {
    duration,
    phase: step % 4,
    round: Math.floor(step / 4) + 1,
    progress,
    remaining: Math.max(1, Math.ceil(settings.seconds * (1 - progress))),
    active: mode === 'playing' || mode === 'paused',
  };
}
/** Elapsed time comes from the clock, never from counting timer callbacks. */
export function createBreathSession(settings: unknown, now = () => performance.now()) {
  const model = createViewState<BreathSnapshot>({
    settings: breathSettings(settings),
    mode: 'ready',
    position: 0,
    error: null,
  });
  let anchor = 0,
    offset = 0;
  function tick() {
    const state = model.getSnapshot();
    if (state.mode !== 'playing') return;
    const duration = breathAt(state).duration;
    const position = Math.min(duration, offset + Math.max(0, now() - anchor) / 1000);
    model.set({ ...state, position, mode: position >= duration ? 'complete' : 'playing' });
  }
  function pause() {
    tick();
    const state = model.getSnapshot();
    if (state.mode === 'playing') model.set({ ...state, mode: 'paused' });
  }
  return {
    ...model,
    tick,
    pause,
    toggle() {
      const state = model.getSnapshot();
      if (state.mode === 'playing') return pause();
      anchor = now();
      offset = state.mode === 'complete' ? 0 : state.position;
      model.set({ ...state, mode: 'playing', position: offset, error: null });
    },
    reset() {
      model.set({ ...model.getSnapshot(), mode: 'ready', position: 0, error: null });
    },
    configure(next: BreathSettings) {
      model.set({ settings: breathSettings(next), mode: 'ready', position: 0, error: null });
    },
    audioFailed() {
      pause();
      model.set({
        ...model.getSnapshot(),
        error: 'Couldn’t play the tick sound. Press Play to try again.',
      });
    },
  };
}
export type BreathSession = ReturnType<typeof createBreathSession>;

export function breathSelected() {
  try {
    return localStorage.getItem('dorego.exercise') === 'breathSquares';
  } catch {
    return false;
  }
}
