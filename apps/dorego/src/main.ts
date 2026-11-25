import { createSequence, transitionSequence } from './sequence';
import {audioFailureDetails, invalidateAudioProbe} from './live-audio';
import { adjacentExercise } from './exercise-navigation';
import { bindMediaSession } from '@ldayton/ui/media-session';
import { configurePlaybackSession } from './audio-session';
import { bindExerciseUrl } from './exercise-url';
import { ExerciseControls } from './maqamat-controls';
import { account } from './account';
import { preferences, encodePreferences, decodePreferences } from './preferences';
import {
  PracticeView,
  PracticeToolbar,
  PracticeVolume,
  type PianoSnapshot,
  type PracticeSnapshot,
} from './practice-view';
import { SettingsPage } from './settings-page';
import { createElement } from 'react';
import { createViewState } from '@ldayton/ui/view-state';
import { Builder, ExerciseSelection, type BuilderSnapshot, type SpecPatch } from './builder';
import { editSpec, MIN_NOTE, MAX_NOTE } from './exercise-settings';
import { mountAppShell } from './app-shell';
import { diagnostics, diagnosticsContext } from './diagnostics';
import { phrasePitches, practiceRange } from './keyboard-layout';

import {
  directionName,
  PATTERNS,
  exerciseFamily,
  notePitchAt,
  roundNoteName,
  secondsAt,
  stateAt,
  practiceAt,
  type ExerciseSpec,
} from './music';
import { Player } from './audio';
import { ReferencePiano } from './reference-piano';
import './style.css';
import { setupOffline } from './offline';
import { readAudioChannels, type AudioChannels } from './audio-channels';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
function savedSpec(): ExerciseSpec {
  return preferences.state.spec;
}
const exerciseUrls = bindExerciseUrl(preferences, window, import.meta.env.BASE_URL, (message) =>
  toast(message)
);
let spec = savedSpec();
let sequence = createSequence(spec);
spec = sequence.settings;
let exercise = sequence.timeline;
let renderFailed = false;
let mode: 'ready' | 'starting' | 'playing' | 'paused' | 'complete' = 'ready';
let playRequest = 0;
let position = 0;
let raf = 0;
// This applies to every audio source on the page, including breath cues.
configurePlaybackSession(navigator as Navigator & { audioSession?: { type: string } });

const player = new Player();
const updateMediaSession = bindMediaSession(
  navigator.mediaSession,
  (title) => new MediaMetadata({ title, artist: 'DoReGo' }),
  {
    play: () => {
      if (systemWarmupActive() && mode !== 'playing' && mode !== 'starting')
        return togglePlay();
    },
    pause: () => {
      if (systemWarmupActive() && (mode === 'playing' || mode === 'starting'))
        stop(false);
    },
    seek: (seconds) => {
      if (systemWarmupActive()) seekTo(seconds);
    },
    previous: () => {
      moveExercise(-1);
    },
    next: () => {
      moveExercise(1);
    },
  }
);

const builderModel = createViewState<BuilderSnapshot>({ spec: { ...spec }, error: null });
let formError: string | null = null;
let toastMessage = '';
let lastControlsUpdate = -Infinity;
const playbackModel = createViewState({
  position,
  duration: secondsAt(exercise.totalBeats, spec.bpm),
  round: 1,
  rounds: exercise.rounds.length,
});
const practiceModel = createViewState<PracticeSnapshot>({
  mode,
  warming: true,
  failed: false,
  error: null,
  title: '',
  bpm: spec.bpm,
  volume: spec.volume,
  toast: '',
  readout: null,
});
const pianoModel = createViewState<PianoSnapshot>({
  low: spec.low,
  root: spec.low,
  high: spec.low + 12,
  pitches: [],
  labels: {},
  voices: [],
});
const reference = new ReferencePiano(spec.volume, (error) => {
  diagnostics.capture(error, 'audio.reference_failed', audioFailureDetails(error));
  toast(error instanceof Error ? error.message : 'Could not play this note. Try again.');
});
function changeAudioChannels(channels: AudioChannels) {
  player.setAudioChannels(channels);
  reference.setAudioChannels(channels);
}
changeAudioChannels(readAudioChannels());
mountAppShell($('#app'), {
  shutdown: () => {
    exerciseUrls.dispose();
    renderFailed = true;
    updateMediaSession('', 'ready');
    ++playRequest;
    reference.shutdown();
    player.shutdown();
    cancelAnimationFrame(raf);
  },
  selection: (selected: () => void, active: boolean) =>
    createElement(ExerciseSelection, {
      model: builderModel,
      active,
      change: (patch: SpecPatch) => {
        refresh(patch);
        selected();
      },
    }),
  title: 'Warm-up',
  getVolume: () => spec.volume,
  moveExercise,
  volumeControl: createElement(PracticeVolume, { model: practiceModel, volume: changeVolume }),
  toolbar: createElement(PracticeToolbar, {
    model: practiceModel,
    playback: playbackModel,
    play: () => {
      void togglePlay();
    },
    restart: restartSequence,
    tempo: changeTempo,
    moveRound,
    volume: changeVolume,
  }),
  pause: () => {
    reference.stopAll();
    if (mode === 'playing' || mode === 'starting') stop(false);
  },
  builder: createElement(Builder, {
    model: builderModel,
    change: (patch) => refresh(patch),
    transpose,
  }),
  practice: createElement(PracticeView, {
    model: practiceModel,
    playback: playbackModel,
    piano: pianoModel,
    controls: createElement(ExerciseControls, {
      model: builderModel,
      change: (patch) => refresh(patch),
    }),
    audition: (midi) => reference.press(midi),
    repeatRound: repeatCurrentRound,
  }),
  settingsView: createElement(SettingsPage, { onAudioChannelsChange: changeAudioChannels }),
});
setupOffline();
function populate() {
  builderModel.set({ spec: { ...spec }, error: formError });
}
function transpose(step: number) {
  if (spec.low + step < MIN_NOTE || spec.high + step > MAX_NOTE)
    return toast('That is the edge of the supported range.');
  refresh({ key: (spec.key + step + 12) % 12, low: spec.low + step, high: spec.high + step });
}
let toastTimeout: ReturnType<typeof setTimeout>;
function toast(message: string) {
  toastMessage = message;
  clearTimeout(toastTimeout);
  update(true);
  toastTimeout = setTimeout(() => {
    toastMessage = '';
    update(true);
  }, 4000);
}
function persist() {
  if (formError) return;
  preferences.update({ spec: { ...spec } });
}
let pianoWarming = true;
let pianoFailed = false;
let warmupGeneration = 0;
async function warmPiano() {
  const generation = ++warmupGeneration;
  pianoWarming = true;
  pianoFailed = false;
  update(true);
  try {
    await player.prepare(exercise);
    if (generation !== warmupGeneration) return;
    pianoWarming = false;
  } catch (error) {
    if (generation !== warmupGeneration) return;
    pianoWarming = false;
    pianoFailed = true;
    diagnostics.capture(error, 'samples.prepare_failed');
    toast(error instanceof Error ? error.message : 'Could not load the recordings. Try again.');
  }
  update(true);
}
function setError(message: string | null) {
  formError = message;
  builderModel.set({ spec: { ...spec }, error: message });
  update(true);
}
function restartSequence() {
  const result = transitionSequence(sequence, { type: 'restart' });
  sequence = result.state;
  exercise = sequence.timeline;
  position = 0;
  stop();
  update(true);
}
function stop(reset = true) {
  ++playRequest;
  reference.stopAll();
  if (reset) player.reset();
  else player.pause();
}
function applySettings(next: ExerciseSpec) {
  const result = transitionSequence(sequence, {
    type: 'settings', settings: next,
    position: mode === 'playing' ? player.position : position,
    commitPosition: mode === 'playing' ? player.planningPosition : position, mode,
  });
  const old = spec;
  if (result.effect === 'reset') stop();
  else {
    if (next.bpm !== old.bpm) player.setTempo(next.bpm);
    if (next.volume !== old.volume) player.setVolume(next.volume);
    if (next.drone !== old.drone) player.setDrone(!!next.drone);
    if (next.droneStrength !== old.droneStrength) player.setDroneStrength(next.droneStrength ?? 50);
  }
  sequence = result.state;
  spec = sequence.settings;
  exercise = sequence.timeline;
  position = result.position;
  reference.setVolume(spec.volume);
  if (result.effect !== 'reset') player.replaceSequence(exercise, result.effect === 'replace-future' ? result.protectedThrough : Infinity);
  setError(null);
  persist();
  populate();
  if (result.effect === 'reset') void warmPiano();
  update(true);
}
function refresh(patch: SpecPatch = {}) {
  try {
    const next = editSpec(spec, patch);
    if (Object.entries(next).every(([key, value]) => value === spec[key as keyof ExerciseSpec])) {
      setError(null);
      return;
    }
    applySettings(next);
    diagnostics.event('exercise.changed');
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Check the exercise settings.');
  }
}
function changeTempo(bpm: number) {
  if (!Number.isFinite(bpm) || bpm < 60 || bpm > 240 || bpm === spec.bpm) return;
  refresh({ bpm });
}
function changeVolume(volume: number) {
  if (!Number.isFinite(volume) || volume < -60 || volume > 0 || volume === spec.volume) return;
  refresh({ volume });
}
function systemWarmupActive() { return preferences.state.selected === 'warmup' && location.hash !== '#settings'; }
function moveExercise(step: -1 | 1) {
  if (location.hash === '#settings') return;
  const next = adjacentExercise(spec.pattern, preferences.state.selected, step);
  stop(false);
  if (next.pattern) refresh({ pattern: next.pattern });
  preferences.update({ selected: next.selected });
}
function updateSystemMedia(force = false) {
  updateMediaSession(
    systemWarmupActive()
      ? (exercise.title ?? `${PATTERNS[spec.pattern].name} (${directionName(spec.direction)})`)
      : '',
    systemWarmupActive() ? mode : 'ready',
    systemWarmupActive()
      ? { position, duration: secondsAt(exercise.totalBeats, spec.bpm), force }
      : undefined
  );
}
function update(force = false) {
  updateSystemMedia(force);
  diagnosticsContext(spec, mode, pianoWarming, pianoFailed);
  const duration = secondsAt(exercise.totalBeats, spec.bpm);
  const time = mode === 'ready' ? -1 : position;
  const scene = stateAt(exercise, time);
  const replayRest = player.restRemainingBeats;
  const practice = practiceAt(exercise, time);
  const roundReadout = (round: typeof practice.current) => {
    const range = practiceRange(exercise, round);
    return {
      note: roundNoteName(round.midi, round),
      range: `${roundNoteName(range.low, round)} – ${roundNoteName(range.high, round)}`,
    };
  };
  const describeRound = (round: typeof practice.current) => {
    const range = practiceRange(exercise, round);
    return `${roundNoteName(round.midi, round)}, range ${roundNoteName(range.low, round)} to ${roundNoteName(range.high, round)}`;
  };
  const description =
    scene.phase === 'countin'
      ? `Count-in: bar ${Math.floor(scene.beat / 4) + 1} of ${Math.ceil(exercise.spec.countIn / 4)}, beat ${scene.count}`
      : scene.phase === 'complete'
        ? 'Exercise complete'
        : `Current practice note ${describeRound(practice.current)}. Next ${practice.next ? describeRound(practice.next) : 'none'}`;
  // Audio stays at its native cadence; React receives only changed view snapshots.
  const now = performance.now();
  if (force || mode !== 'playing' || now - lastControlsUpdate >= 50) {
    lastControlsUpdate = now;
    playbackModel.set({
      position,
      duration,
      round: practice.current.id + 1,
      rounds: exercise.rounds.length,
    });
    const range = practiceRange(exercise, practice.current);
    pianoModel.set({
      pitches: phrasePitches(exercise, practice.current),
      labels: Object.fromEntries(
        phrasePitches(exercise, practice.current).map((pitch) => [
          pitch,
          roundNoteName(pitch, practice.current),
        ])
      ),
      root: practice.current.midi - practice.current.degree,
      low: Math.max(24, range.low),
      high: Math.min(96, range.high),
      voices:
        mode === 'playing' && !replayRest && scene.phase !== 'countin'
          ? exercise.notes
              .filter(
                (note) =>
                  note.onsetBeat <= scene.beat && scene.beat < note.onsetBeat + note.durationBeats
              )
              .map((note) => ({
                pitch: note.glideSpan ? Math.round(notePitchAt(note, scene.beat)) : note.midi,
                start: note.onsetBeat,
              }))
          : [],
    });
    practiceModel.set({
      mode,
      warming: pianoWarming,
      failed: pianoFailed,
      error: mode === 'ready' ? formError : null,
      title: exercise.title ?? `${PATTERNS[spec.pattern].name} (${directionName(spec.direction)})`,
      bpm: spec.bpm,
      volume: spec.volume,
      toast: toastMessage,
      readout: {
        status:
          player.preparingNextRound
            ? 'Preparing next round…'
            : replayRest > 0
            ? 'Rest · repeat round in'
            : scene.phase === 'countin'
            ? 'Count-in'
            : scene.phase === 'complete'
              ? 'Complete'
              : scene.phase === 'rest'
                ? 'Rest · next round in'
                : scene.phase === 'ready'
                  ? 'Ready'
                  : '',
        restCount: replayRest > 0 ? Math.ceil(replayRest) : scene.phase === 'rest' ? scene.count : null,
        countIn:
          scene.phase === 'countin'
            ? {
                beat: scene.count,
                bar: Math.floor(scene.beat / 4) + 1,
                bars: Math.ceil(exercise.spec.countIn / 4),
              }
            : null,
        current: roundReadout(practice.current),
        next: practice.next ? roundReadout(practice.next) : null,
        description,
      },
    });
  }
}

function tick() {
  diagnostics.frame(performance.now(), mode === 'playing' && !document.hidden);
  if (mode !== 'playing') return;
  position = player.position;
  update();
  raf = requestAnimationFrame(tick);
}
player.onStateChange = (state, nextPosition, reason) => {
  diagnostics.frame(performance.now(), false);
  diagnostics.event('playback.state', { mode: state, reason });
  mode = state;
  position = nextPosition;
  cancelAnimationFrame(raf);
  if (state === 'playing') tick();
  else update(true);
  if (reason === 'clock-stalled') toast('Audio stopped responding. Tap Resume to try again.');
  if (reason === 'samples-failed') toast('Could not load the next round. Tap Resume to try again.');
  if (reason === 'scheduling-gap') toast('Playback paused after a delay. Resume to continue.');
};
function moveRound(step: number) {
  if (pianoWarming || renderFailed) return;
  const result = transitionSequence(sequence, { type: 'move', position, step });
  if (result.effect === 'seek') seekTo(result.position);
}
function repeatCurrentRound() {
  if (pianoWarming || pianoFailed || renderFailed) return;
  const at = mode === 'playing' ? player.position : position;
  const result = transitionSequence(sequence, { type: 'repeat', position: at });
  diagnostics.event('playback.repeat_round');
  seekTo(result.position, true, result.restBeats);
}
function seekTo(seconds: number, running = mode === 'playing' || mode === 'starting', restBeats = 0) {
  if (pianoWarming || renderFailed || !Number.isFinite(seconds)) return;
  const at = Math.max(0, Math.min(secondsAt(exercise.totalBeats, spec.bpm), seconds));
  ++playRequest;
  reference.stopAll();
  player.seek(exercise, at);
  if (running) void startAt(at, restBeats);
}
async function startAt(offset: number, restBeats = 0) {
  const request = ++playRequest;
  try {
    await player.play(exercise, offset, restBeats);
  } catch (error) {
    if (request !== playRequest) return;
    diagnostics.capture(error, 'playback.start_failed', audioFailureDetails(error));
    toast(error instanceof Error ? error.message : 'Could not start audio.');
  }
}
async function togglePlay() {
  if (renderFailed || pianoWarming) return;
  if (pianoFailed) {
    void warmPiano();
    return;
  }
  if (mode === 'playing' || mode === 'starting') {
    stop(false);
    return;
  }
  if (position >= secondsAt(exercise.totalBeats, spec.bpm)) restartSequence();
  await startAt(position);
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('#practice-card').requestFullscreen();
  } catch {
    toast('Fullscreen is not available in this browser.');
  }
}
document.addEventListener('keydown', (event) => {
  if (
    renderFailed ||
    document.getElementById('breath-squares') ||
    location.hash === '#settings' ||
    (event.target as HTMLElement).closest(
      'a[href], input, select, textarea, button, summary, dialog, [role="dialog"], [role="spinbutton"], [role="slider"]'
    ) ||
    document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.repeat
  )
    return;
  if (event.code === 'Space') {
    event.preventDefault();
    void togglePlay();
  }
  if (event.key.toLowerCase() === 'r') restartSequence();
  if (event.key.toLowerCase() === 'f') void toggleFullscreen();
});
populate();
update(true);
if (preferences.state.selected !== 'breathSquares') void warmPiano();
// Hiding alone does not pause healthy background audio. Freezing/navigation
// does: preserve position and require an explicit Resume after restoration.
window.addEventListener('blur', () => {
  invalidateAudioProbe();
  reference.stopAll();
});
window.addEventListener('pagehide', () => {
  reference.stopAll();
  player.interrupt('page-hidden');
});
document.addEventListener('freeze', () => player.interrupt('page-hidden'));
window.addEventListener('pageshow', () => {
  invalidateAudioProbe();
  diagnostics.event('page.restored', audioFailureDetails(undefined));
  player.reconcile();
  update(true);
});
document.addEventListener('resume', () => {
  invalidateAudioProbe();
  player.reconcile();
  update(true);
});
document.addEventListener('visibilitychange', () => {
  invalidateAudioProbe();
  diagnostics.event(document.hidden ? 'page.background' : 'page.foreground', {visible: !document.hidden, ...audioFailureDetails(undefined)});
  if (document.hidden) {
    reference.stopAll();
    if (mode === 'starting') player.interrupt('page-hidden');
  }
  if (!document.hidden) {
    player.reconcile();
    update(true);
  }
});

window.addEventListener('hashchange', () => updateSystemMedia(true));
window.dispatchEvent(new Event('soundtools:ready'));
preferences.subscribe((source) => {
  if (source === 'url') void account.changed();
  if (source === 'local') {
    updateSystemMedia();
    void account.changed();
    return;
  }
  try {
    applySettings(preferences.state.spec);
    changeAudioChannels(preferences.state.channels);
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Check the restored exercise settings.');
  }
});
void account.start({
  read: () => encodePreferences(preferences.state),
  validate: (records) => {
    decodePreferences(records);
  },
  applyPartial: async (records, keys) => {
    const incomingPattern = (records['exercise.pitch'] as { pattern?: ExerciseSpec['pattern'] } | undefined)?.pattern;
    const sameExercise = !!incomingPattern && exerciseFamily(incomingPattern) === exerciseFamily(spec.pattern);
    const accepted = keys.filter(
      (key) =>
        (key.startsWith('exercise.') && (key !== 'exercise.pitch' || sameExercise)) ||
        key === 'channels' ||
        (key === 'breathing' && preferences.state.selected === 'warmup')
    );
    if (!accepted.length) return [];
    const merged = encodePreferences(preferences.state);
    for (const key of accepted) if (key in records) merged[key] = records[key];
    preferences.apply(merged);
    return accepted;
  },
  apply: (records) => preferences.apply(records),
  pause: () => stop(false),
  canApply: () =>
    mode !== 'playing' &&
    mode !== 'starting' &&
    !document.querySelector(
      '#breath-play[data-mode="playing"], #breath-play[data-mode="starting"]'
    ) &&
    !document.activeElement?.closest('input,select,textarea,[role="spinbutton"],[role="slider"]'),
});
