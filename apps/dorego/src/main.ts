import { PracticeView, type PracticeSnapshot } from './practice-view';
import { PracticeFooter } from './footer';
import { createElement } from 'react';
import { createViewState } from '@ldayton/ui/view-state';
import { Builder, type BuilderSnapshot, type SpecPatch } from './builder';
import { restoreSpec, editSpec } from './exercise-settings';
import { mountAppShell } from './app-shell';
import { diagnostics, diagnosticsContext } from './diagnostics';
import { practiceRange } from './keyboard-layout';

import {
  DEFAULT_SPEC,
  isVocalPattern,
  supportsNoteRepeats,
  isGlidePattern,
  vocalSpan,
  directionName,
  PATTERNS,
  generateExercise as generateBoundedExercise,
  noteName,
  noteChoiceLabel,
  roundNoteName,
  secondsAt,
  formatTime,
  stateAt,
  practiceAt,
  phraseLabel,
  phraseContour,
  progressionRoots,
  type Direction,
  type ExerciseSpec,
} from './music';
import { Player } from './audio';
import { drawExercise, WIDTH, HEIGHT, MOBILE_HEIGHT } from './render';
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
const practiceModel = createViewState<PracticeSnapshot>({
  mode,
  warming: true,
  failed: false,
  error: null,
  title: '',
  summary: '',
  bpm: spec.bpm,
  volume: spec.volume,
  position,
  duration: secondsAt(exercise.totalBeats, spec.bpm),
  toast: '',
});
mountAppShell($('#app'), {
  builder: createElement(Builder, {
    model: builderModel,
    change: (patch) => refresh(patch),
    transpose,
  }),
  practice: createElement(PracticeView, {
    model: practiceModel,
    stage,
    play: () => {
      void togglePlay();
    },
    restart: () => stop(),
    seek: (value) => {
      ++playRequest;
      player.seek(exercise, value);
    },
    tempo: changeTempo,
    volume: changeVolume,
  }),
  footer: createElement(PracticeFooter),
});
setupOffline();
canvas.width = WIDTH;
canvas.height = HEIGHT;
const mobileQuery = window.matchMedia('(max-width: 760px)');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
reducedMotionQuery.addEventListener('change', () => update());
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
  canvas.height = mobileStage ? Math.round((canvas.width * MOBILE_HEIGHT) / WIDTH) : HEIGHT;
  canvas.style.aspectRatio = mobileStage ? '1 / 1' : '16 / 9';
  update(true);
}
window.addEventListener('resize', resizeStage);
document.addEventListener('fullscreenchange', resizeStage);
mobileQuery.addEventListener('change', resizeStage);
function populate() {
  builderModel.set({ spec: { ...spec }, error: formError });
}
function transpose(step: number) {
  if (spec.low + step < 24 || spec.high + step > 96)
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
  drawExercise(canvas, exercise, time, mobileStage, reducedMotionQuery.matches);
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
    practiceModel.set({
      mode,
      warming: pianoWarming,
      failed: pianoFailed,
      error: formError,
      title: exercise.title ?? `${PATTERNS[spec.pattern].name} (${directionName(spec.direction)})`,
      summary: exercise.title
        ? isGlidePattern(spec.pattern)
          ? `${exercise.rounds.length} ${exercise.rounds.length === 1 ? 'glide' : 'glides'}`
          : `${exercise.notes.length} notes · ${exercise.rounds.length} rounds`
        : `${exercise.notes.length} notes · ${spec.repetitions} ${spec.repetitions === 1 ? 'round' : 'rounds'} · ${spec.countIn ? (spec.countIn % 4 === 0 ? `${spec.countIn / 4}-bar count-in` : `${spec.countIn}-beat count-in`) : 'No count-in'}`,
      bpm: spec.bpm,
      volume: spec.volume,
      position,
      duration,
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
async function togglePlay() {
  if (pianoWarming || formError) return;
  if (pianoFailed) {
    void warmPiano();
    return;
  }
  if (mode === 'playing' || mode === 'starting') {
    stop(false);
    return;
  }
  if (position >= secondsAt(exercise.totalBeats, spec.bpm)) position = 0;
  const request = ++playRequest;
  try {
    await player.play(exercise, position);
  } catch (error) {
    if (request !== playRequest) return;
    diagnostics.capture(error, 'playback.start_failed');
    toast(error instanceof Error ? error.message : 'Could not start audio.');
  }
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
    (event.target as HTMLElement).closest(
      'input, select, textarea, button, summary, dialog, [role="dialog"], [role="spinbutton"], [role="slider"]'
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
window.addEventListener('pagehide', () => player.interrupt('page-hidden'));
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
  if (!document.hidden) {
    player.reconcile();
    update(true);
  }
});

window.dispatchEvent(new Event('soundtools:ready'));
