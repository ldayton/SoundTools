import {
  PracticeView,
  PracticeToolbar,
  type PianoSnapshot,
  type PracticeSnapshot,
} from './practice-view';
import { SettingsPage } from './settings-page';
import { createElement } from 'react';
import { createViewState } from '@ldayton/ui/view-state';
import { Builder, ExerciseSelection, type BuilderSnapshot, type SpecPatch } from './builder';
import { restoreSpec, editSpec, MIN_NOTE, MAX_NOTE } from './exercise-settings';
import { mountAppShell } from './app-shell';
import { diagnostics, diagnosticsContext } from './diagnostics';
import { practiceRange } from './keyboard-layout';

import {
  DEFAULT_SPEC,
  directionName,
  PATTERNS,
  generateExercise as generateBoundedExercise,
  notePitchAt,
  roundNoteName,
  secondsAt,
  stateAt,
  practiceAt,
  type ExerciseSpec,
} from './music';
import { Player } from './audio';
import { ReferencePiano } from './reference-piano';
import { drawPractice, WIDTH, PRACTICE_HEIGHT, PRACTICE_MOBILE_HEIGHT } from './render';
import './style.css';
import { setupOffline } from './offline';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
function savedSpec(): ExerciseSpec {
  try {
    return restoreSpec(
      JSON.parse(localStorage.getItem('dorego.current') || 'null'),
      localStorage.getItem('dorego.glideShapeVersion')
    );
  } catch {
    return { ...DEFAULT_SPEC, progression: 'up' };
  }
}
// Practice can slow down freely; the CLI/video renderer keeps its duration cap.
const generateExercise = (input: unknown) => generateBoundedExercise(input, Infinity);
let spec = savedSpec();
let exercise = generateExercise(spec);
let renderFailed = false;
let mode: 'ready' | 'starting' | 'playing' | 'paused' | 'complete' = 'ready';
let playRequest = 0;
let position = 0;
let raf = 0;
const player = new Player();

const stage = document.createElement('div');
stage.innerHTML =
  '<canvas id="stage" width="1600" height="900" aria-label="Exercise note and piano keyboard" role="img"></canvas><span class="sr-only" id="note-announcement" aria-live="polite"></span>';
const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!;
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
});
const pianoModel = createViewState<PianoSnapshot>({
  low: spec.low,
  root: spec.low,
  high: spec.low + 12,
  voices: [],
});
const reference = new ReferencePiano(spec.volume, (error) => {
  diagnostics.capture(error, 'audio.reference_failed');
  toast(error instanceof Error ? error.message : 'Could not play this note. Try again.');
});
mountAppShell($('#app'), {
  shutdown: () => {
    renderFailed = true;
    ++playRequest;
    reference.shutdown();
    player.shutdown();
    cancelAnimationFrame(raf);
  },
  selection: (selected: () => void) =>
    createElement(ExerciseSelection, {
      model: builderModel,
      change: (patch: SpecPatch) => {
        refresh(patch);
        selected();
      },
    }),
  title: 'Warm-up',
  toolbar: createElement(PracticeToolbar, {
    model: practiceModel,
    playback: playbackModel,
    play: () => {
      void togglePlay();
    },
    restart: () => stop(),
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
    stage,
    piano: pianoModel,
    audition: (midi) => reference.press(midi),
  }),
  settingsView: createElement(SettingsPage),
});
setupOffline();
canvas.width = WIDTH;
canvas.height = PRACTICE_HEIGHT;
const mobileQuery = window.matchMedia('(max-width: 760px)');
let mobileStage = false;
function resizeStage() {
  mobileStage =
    mobileQuery.matches && (!document.fullscreenElement || window.innerHeight >= window.innerWidth);
  canvas.width = mobileStage
    ? Math.min(
        WIDTH,
        Math.max(320, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)))
      )
    : WIDTH;
  canvas.height = mobileStage
    ? Math.round((canvas.width * PRACTICE_MOBILE_HEIGHT) / WIDTH)
    : PRACTICE_HEIGHT;
  canvas.style.aspectRatio = `${WIDTH} / ${mobileStage ? PRACTICE_MOBILE_HEIGHT : PRACTICE_HEIGHT}`;
  update(true);
}
window.addEventListener('resize', resizeStage);
document.addEventListener('fullscreenchange', resizeStage);
mobileQuery.addEventListener('change', resizeStage);
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
  try {
    localStorage.setItem('dorego.current', JSON.stringify(spec));
    localStorage.setItem('dorego.glideShapeVersion', '1');
  } catch {
    /* Practice works without storage. */
  }
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
function stop(reset = true) {
  ++playRequest;
  reference.stopAll();
  if (reset) player.reset();
  else player.pause();
}
function refresh(patch: SpecPatch = {}) {
  diagnostics.event('exercise.changed');
  stop();
  try {
    spec = editSpec(spec, patch);
    exercise = generateExercise(spec);
    spec = exercise.spec;
    setError(null);
    persist();
    populate();
    void warmPiano();
    update(true);
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Check the exercise settings.');
  }
}
function changeTempo(bpm: number) {
  if (!Number.isFinite(bpm) || bpm < 60 || bpm > 240 || bpm === spec.bpm) return;
  diagnostics.event('exercise.tempo_changed');
  player.setTempo(bpm);
  spec = { ...spec, bpm };
  exercise = { ...exercise, spec: { ...exercise.spec, bpm } };
  position = player.position;
  persist();
  populate();
  update(true);
}
function changeVolume(volume: number) {
  if (!Number.isFinite(volume) || volume < -60 || volume > 0 || volume === spec.volume) return;
  reference.setVolume(volume);
  player.setVolume(volume);
  spec = { ...spec, volume };
  exercise = { ...exercise, spec: { ...exercise.spec, volume } };
  persist();
  populate();
  update(true);
}
let announced = '';
function update(force = false) {
  diagnosticsContext(spec, mode, pianoWarming, pianoFailed);
  const duration = secondsAt(exercise.totalBeats, spec.bpm);
  const time = mode === 'ready' ? -1 : position;
  drawPractice(canvas, exercise, time, mobileStage);
  const scene = stateAt(exercise, time);
  const practice = practiceAt(exercise, time);
  const describeRound = (round: typeof practice.current) => {
    const range = practiceRange(exercise, round);
    return `${roundNoteName(round.midi, round)}, range ${roundNoteName(range.low, round)} to ${roundNoteName(range.high, round)}`;
  };
  const description =
    scene.phase === 'countin'
      ? `Count-in: bar ${Math.floor(scene.beat / 4) + 1} of ${Math.ceil(spec.countIn / 4)}, beat ${scene.count}`
      : scene.phase === 'complete'
        ? 'Exercise complete'
        : `Current practice note ${describeRound(practice.current)}. Next ${practice.next ? describeRound(practice.next) : 'none'}`;
  canvas.setAttribute(
    'aria-label',
    `${exercise.title ?? PATTERNS[spec.pattern].name}. ${description}`
  );
  if (description !== announced) {
    $('#note-announcement').textContent = description;
    announced = description;
  }
  // Canvas and audio stay at their native cadence; ordinary controls receive at most 20 updates/sec.
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
      root: practice.current.midi - practice.current.degree,
      low: Math.max(24, range.low - 1),
      high: Math.min(96, range.high + 1),
      voices:
        mode === 'playing' && scene.phase !== 'countin'
          ? exercise.notes
              .filter(
                (note) =>
                  note.onsetBeat <= scene.beat && scene.beat < note.onsetBeat + note.durationBeats
              )
              .map((note) => ({
                pitch: Math.round(notePitchAt(note, scene.beat)),
                start: note.onsetBeat,
              }))
          : [],
    });
    practiceModel.set({
      mode,
      warming: pianoWarming,
      failed: pianoFailed,
      error: formError,
      title: exercise.title ?? `${PATTERNS[spec.pattern].name} (${directionName(spec.direction)})`,
      bpm: spec.bpm,
      volume: spec.volume,
      toast: toastMessage,
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
  if (reason === 'scheduling-gap') toast('Playback paused after a delay. Resume to continue.');
};
function moveRound(step: number) {
  if (pianoWarming || formError || renderFailed) return;
  const current = practiceAt(exercise, position).current.id;
  const target = Math.max(0, Math.min(exercise.rounds.length - 1, current + step));
  if (target === current) return;
  const running = mode === 'playing' || mode === 'starting';
  const at = secondsAt(exercise.rounds[target].onsetBeat, spec.bpm);
  ++playRequest;
  reference.stopAll();
  player.seek(exercise, at);
  if (running) void startAt(at);
}
async function startAt(offset: number) {
  const request = ++playRequest;
  try {
    await player.play(exercise, offset);
  } catch (error) {
    if (request !== playRequest) return;
    diagnostics.capture(error, 'playback.start_failed');
    toast(error instanceof Error ? error.message : 'Could not start audio.');
  }
}
async function togglePlay() {
  if (renderFailed || pianoWarming || formError) return;
  if (pianoFailed) {
    void warmPiano();
    return;
  }
  if (mode === 'playing' || mode === 'starting') {
    stop(false);
    return;
  }
  if (position >= secondsAt(exercise.totalBeats, spec.bpm)) position = 0;
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
  if (event.key.toLowerCase() === 'r') stop();
  if (event.key.toLowerCase() === 'f') void toggleFullscreen();
});
populate();
resizeStage();
void warmPiano();
// Hiding alone does not pause healthy background audio. Freezing/navigation
// does: preserve position and require an explicit Resume after restoration.
window.addEventListener('blur', () => reference.stopAll());
window.addEventListener('pagehide', () => {
  reference.stopAll();
  player.interrupt('page-hidden');
});
document.addEventListener('freeze', () => player.interrupt('page-hidden'));
window.addEventListener('pageshow', () => {
  player.reconcile();
  update(true);
});
document.addEventListener('resume', () => {
  player.reconcile();
  update(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) reference.stopAll();
  if (!document.hidden) {
    player.reconcile();
    update(true);
  }
});

window.dispatchEvent(new Event('soundtools:ready'));
