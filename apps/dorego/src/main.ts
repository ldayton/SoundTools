import { createElement } from 'react';
import { createViewState } from '@ldayton/ui/view-state';
import { Builder, type BuilderSnapshot, type SpecPatch } from './builder';
import { restoreSpec, editSpec } from './exercise-settings';
import { mountAppShell } from './app-shell';
import { diagnostics, diagnosticsContext, mountDiagnostics } from './diagnostics';
import { practiceRange } from './keyboard-layout';
import {
  createIcons,
  Play,
  Pause,
  RotateCcw,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Music2,
  ArrowDownRight,
  X,
  Volume2,
  Check,
} from 'lucide';
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
const icons = {
  Play,
  Pause,
  RotateCcw,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Music2,
  ArrowDownRight,
  X,
  Volume2,
  Check,
};
function iconify() {
  createIcons({ icons, attrs: { 'stroke-width': 1.7 } });
}
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

const workspace = document.createElement('div');
workspace.innerHTML = `
  <main>
    <h1 class="sr-only">Practice</h1>
    <div class="studio">
      <div class="builder-column">
      <aside class="settings" aria-label="Exercise builder">
        <div class="panel-heading"><h2>Exercise builder</h2><i data-lucide="music-2"></i></div>
        <div id="builder-slot"></div>
      </aside>
      </div>
      <section class="workspace" aria-label="Practice studio">
        <div class="exercise-heading"><div><h2 id="exercise-title"></h2></div></div>
        <div class="practice-panel">
        <div class="practice-card" id="practice-card"><canvas id="stage" width="1600" height="900" aria-label="Exercise note and piano keyboard" role="img"></canvas><span class="sr-only" id="note-announcement" aria-live="polite"></span></div>
        <div class="exercise-controls" role="group" aria-label="Exercise playback controls">
        <div class="transport"><div class="transport-buttons"><button id="restart" class="icon-button" title="Restart exercise" aria-label="Restart exercise"><i data-lucide="rotate-ccw"></i></button><button id="play" class="play-button"><i data-lucide="play"></i><span>Play</span></button></div><div class="scrubber"><label for="position" class="sr-only">Playback position</label><input id="position" type="range" min="0" max="100" step="0.01" value="0"/><div class="time-labels"><span id="elapsed">0:00</span><span id="duration">0:00</span></div></div></div>
        <div class="tempo-control" id="tempo-control" role="group" aria-label="Tempo"><div class="tempo-label"><label for="bpm">Tempo</label><span><button type="button" id="tempo-down" class="tempo-step" aria-label="Decrease tempo by 5 BPM"><i data-lucide="minus"></i></button><span class="tempo-value"><input name="bpm" form="exercise-form" id="bpm" type="number" min="60" max="240" step="5" aria-label="Tempo in beats per minute"/><span>BPM</span></span><button type="button" id="tempo-up" class="tempo-step" aria-label="Increase tempo by 5 BPM"><i data-lucide="plus"></i></button></span></div>
          <input id="tempo-slider" type="range" min="60" max="240" step="5" aria-label="Tempo slider" /></div>
        <div class="volume-control" id="volume-control"><label for="volume">Volume <i data-lucide="volume-2" aria-hidden="true"></i></label><input name="volume" form="exercise-form" id="volume" type="range" min="-36" max="0" step="1" aria-label="Volume" /></div>
        <div class="below-player"><p id="exercise-summary"></p></div>
        </div>
        </div>
      </section>
    </div>

  </main>
  <div id="toast" class="toast" role="status" hidden></div>
`;

const builderModel = createViewState<BuilderSnapshot>({ spec: { ...spec }, error: null });
let formError: string | null = null;
mountAppShell(
  $('#app'),
  workspace,
  createElement(Builder, { model: builderModel, change: (patch) => refresh(patch), transpose })
);

$('.builder-column').insertAdjacentHTML(
  'beforeend',
  `<section class="offline-section" aria-label="Offline use"><div><h2>Take it with you</h2><p id="offline-status" role="status">Preparing offline support…</p></div><button type="button" id="offline-download" class="quiet-button" disabled>Download for offline use</button><button type="button" id="offline-update" class="quiet-button" hidden>Update available</button><progress id="offline-progress" aria-label="Offline download progress" hidden></progress></section>`
);
setupOffline();
mountDiagnostics($('.builder-column'));

const canvas = $<HTMLCanvasElement>('#stage');
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
  update();
}
window.addEventListener('resize', resizeStage);
document.addEventListener('fullscreenchange', resizeStage);
mobileQuery.addEventListener('change', resizeStage);
function populate() {
  builderModel.set({ spec: { ...spec }, error: formError });
  $<HTMLInputElement>('#bpm').value = String(spec.bpm);
  $<HTMLInputElement>('#volume').value = String(spec.volume);
  $<HTMLInputElement>('#tempo-slider').value = String(spec.bpm);
  syncTempoSteps();
}
function transpose(step: number) {
  if (spec.low + step < 24 || spec.high + step > 96)
    return toast('That is the edge of the supported range.');
  refresh({ key: (spec.key + step + 12) % 12, low: spec.low + step, high: spec.high + step });
}
let toastTimeout: ReturnType<typeof setTimeout>;
function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    $('#toast').hidden = true;
  }, 4000);
}
function persist() {
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
  update();
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
  update();
}
function syncTempoSteps() {
  const bpm = Number($<HTMLInputElement>('#bpm').value);
  $<HTMLButtonElement>('#tempo-down').disabled = !Number.isFinite(bpm) || bpm <= 60;
  $<HTMLButtonElement>('#tempo-up').disabled = !Number.isFinite(bpm) || bpm >= 240;
}
function setError(message: string | null) {
  syncTempoSteps();
  formError = message;
  builderModel.set({ spec: { ...spec }, error: message });
  $<HTMLButtonElement>('#play').disabled = !!message || pianoWarming;
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
    update();
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Check the exercise settings.');
  }
}
function changeTempo() {
  diagnostics.event('exercise.tempo_changed');
  const bpm = Number($<HTMLInputElement>('#bpm').value);
  syncTempoSteps();
  if (!Number.isFinite(bpm) || bpm < 60 || bpm > 240) return;
  if (bpm !== spec.bpm) {
    player.setTempo(bpm);
    spec = { ...spec, bpm };
    exercise = { ...exercise, spec };
    position = player.position;
    persist();
  }
  $<HTMLInputElement>('#tempo-slider').value = String(bpm);
  update();
}
function changeVolume() {
  const volume = Number($<HTMLInputElement>('#volume').value);
  if (volume === spec.volume) return;
  player.setVolume(volume);
  spec = { ...spec, volume };
  exercise = { ...exercise, spec };
  persist();
  update();
}
$<HTMLInputElement>('#volume').addEventListener('input', changeVolume);
$<HTMLInputElement>('#volume').addEventListener('change', changeVolume);
$('#tempo-control').addEventListener('change', () => {
  changeTempo();
  $<HTMLInputElement>('#bpm').value = String(spec.bpm);
  $<HTMLInputElement>('#tempo-slider').value = String(spec.bpm);
  syncTempoSteps();
});
$<HTMLInputElement>('#tempo-slider').addEventListener('input', () => {
  $<HTMLInputElement>('#bpm').value = $<HTMLInputElement>('#tempo-slider').value;
  changeTempo();
});
$<HTMLInputElement>('#bpm').addEventListener('input', changeTempo);
for (const [id, direction] of [
  ['tempo-down', -1],
  ['tempo-up', 1],
] as const)
  $(`#${id}`).addEventListener('click', () => {
    const bpm = Number($<HTMLInputElement>('#bpm').value) || spec.bpm;
    const next = direction > 0 ? (Math.floor(bpm / 5) + 1) * 5 : (Math.ceil(bpm / 5) - 1) * 5;
    $<HTMLInputElement>('#bpm').value = String(Math.max(60, Math.min(240, next)));
    changeTempo();
  });
let announced = '';
function update() {
  diagnosticsContext(spec, mode, pianoWarming, pianoFailed);
  const duration = secondsAt(exercise.totalBeats, spec.bpm);
  const time = mode === 'ready' ? -1 : position;
  $<HTMLInputElement>('#bpm').style.width = `${String(spec.bpm).length}ch`;
  for (const id of ['tempo-slider', 'volume']) {
    const control = $<HTMLInputElement>(`#${id}`);
    const value = id === 'volume' ? spec.volume : spec.bpm;
    const fraction = (value - Number(control.min)) / (Number(control.max) - Number(control.min));
    control.style.setProperty('--fill', `${Math.max(0, Math.min(1, fraction)) * 100}%`);
  }
  const layout = drawExercise(canvas, exercise, time, mobileStage, reducedMotionQuery.matches);
  const inset = `${layout.keyboardInsetPercent}%`;
  if ($('#practice-card').style.getPropertyValue('--keyboard-inset') !== inset)
    $('#practice-card').style.setProperty('--keyboard-inset', inset);
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
  $('#exercise-title').textContent =
    exercise.title ?? `${PATTERNS[spec.pattern].name} (${directionName(spec.direction)})`;
  const button = $('#play');
  const label = pianoWarming
    ? 'Loading...'
    : pianoFailed
      ? 'Retry audio'
      : mode === 'playing' || mode === 'starting'
        ? 'Pause'
        : mode === 'paused'
          ? 'Resume'
          : mode === 'complete'
            ? 'Replay'
            : 'Play';
  const buttonMode = pianoWarming ? 'warming' : pianoFailed ? 'failed' : mode;
  $<HTMLButtonElement>('#play').disabled = pianoWarming || !!formError;
  button.setAttribute('aria-busy', String(pianoWarming));
  if (button.dataset.mode !== buttonMode) {
    button.innerHTML = `${pianoWarming ? '<span class="piano-warmup" aria-hidden="true"><i></i><i></i><i></i></span>' : `<i data-lucide="${mode === 'playing' || mode === 'starting' ? 'pause' : 'play'}"></i>`}<span>${label}</span>`;
    button.dataset.mode = buttonMode;
    iconify();
  }
  const slider = $<HTMLInputElement>('#position');
  slider.max = String(duration);
  slider.value = String(Math.min(position, duration));
  slider.style.setProperty('--fill', `${100 * Math.min(position / duration, 1)}%`);
  $('#elapsed').textContent = formatTime(Math.min(position, duration));
  $('#duration').textContent = formatTime(duration);
  $('#exercise-summary').textContent = exercise.title
    ? isGlidePattern(spec.pattern)
      ? `${exercise.rounds.length} ${exercise.rounds.length === 1 ? 'glide' : 'glides'}`
      : `${exercise.notes.length} notes · ${exercise.rounds.length} rounds`
    : `${exercise.notes.length} notes · ${spec.repetitions} ${spec.repetitions === 1 ? 'round' : 'rounds'} · ${spec.countIn ? (spec.countIn % 4 === 0 ? `${spec.countIn / 4}-bar count-in` : `${spec.countIn}-beat count-in`) : 'No count-in'}`;
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
  else update();
  if (reason === 'scheduling-gap') toast('Playback paused after a delay. Resume to continue.');
};
async function togglePlay() {
  if ($<HTMLButtonElement>('#play').disabled) return;
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
$('#play').addEventListener('click', () => void togglePlay());
$('#restart').addEventListener('click', () => stop());
$<HTMLInputElement>('#position').addEventListener('input', () => {
  ++playRequest;
  player.seek(exercise, Number($<HTMLInputElement>('#position').value));
});
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
      'input, select, textarea, button, summary, dialog, [role="dialog"], [role="spinbutton"]'
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
iconify();
resizeStage();
void warmPiano();
// Hiding alone does not pause healthy background audio. Freezing/navigation
// does: preserve position and require an explicit Resume after restoration.
window.addEventListener('pagehide', () => player.interrupt('page-hidden'));
document.addEventListener('freeze', () => player.interrupt('page-hidden'));
window.addEventListener('pageshow', () => {
  player.reconcile();
  update();
});
document.addEventListener('resume', () => {
  player.reconcile();
  update();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    player.reconcile();
    update();
  }
});

window.dispatchEvent(new Event('soundtools:ready'));
