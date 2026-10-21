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
  isGlidePattern,
  vocalSpan,
  directionName,
  PATTERNS,
  generateExercise as generateBoundedExercise,
  noteName,
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
import { NoteWheel } from './note-wheel';
import { NotePicker } from './note-picker';
import { AnchoredSelect } from './anchored-select';
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
    return restoreSpec(JSON.parse(localStorage.getItem('dorego.current') || 'null'));
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
function restoreSpec(input: unknown): ExerciseSpec {
  if (!input || typeof input !== 'object') throw new Error('Invalid saved exercise.');
  const saved = {
    ...input,
    voice: 'bitklavier',
    metronome: false,
    gate: DEFAULT_SPEC.gate,
    noteBeats: DEFAULT_SPEC.noteBeats,
    solfege: false,
    transition: null,
  } as Record<string, unknown>;
  if (typeof saved.bpm === 'number' && Number.isFinite(saved.bpm) && saved.bpm < 60) saved.bpm = 60;
  if (saved.pattern === 'strawDescending') {
    saved.pattern = 'arpeggio';
    saved.direction = 'down';
  } else if (saved.pattern === 'vocalArpeggios' || saved.pattern === 'minorArpeggio')
    saved.pattern = 'arpeggio';
  else if (['minor', 'pentatonic', 'fiveTone', 'chromatic'].includes(String(saved.pattern)))
    saved.pattern = 'major';
  if (saved.direction === 'updown') saved.direction = 'up';
  if (saved.pattern === 'major') {
    const down = saved.direction === 'down';
    const start = Math.max(
      down ? 36 : 24,
      Math.min(down ? 96 : 84, Number(down ? saved.high : saved.low))
    );
    saved.key = start % 12;
    saved.low = down ? start - 12 : start;
    saved.high = down ? start : start + 12;
  }
  if (saved.progression === undefined) {
    saved.progression =
      saved.pattern === 'rossini' || saved.pattern === 'major' ? 'up' : saved.direction;
    if (saved.direction === 'both' && saved.pattern !== 'major') saved.direction = 'up';
  }
  if (
    isGlidePattern(saved.pattern as ExerciseSpec['pattern']) &&
    saved.direction === 'up' &&
    localStorage.getItem('dorego.glideShapeVersion') !== '1'
  )
    saved.direction = 'both';
  return generateExercise(saved).spec;
}

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="DoReGo home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>DoReGo<span class="brand-dot">.</span></a>
    <button class="quiet-button" id="how-button">Help <i data-lucide="arrow-up-right"></i></button>
  </header>
  <main>
    <h1 class="sr-only">Practice</h1>
    <div class="studio">
      <div class="builder-column">
      <aside class="settings" aria-label="Exercise builder">
        <div class="panel-heading"><h2>Exercise builder</h2><i data-lucide="music-2"></i></div>
        <form id="exercise-form">
          <label class="field">Exercise<select name="pattern" id="pattern">${Object.entries(
            PATTERNS
          )
            .map(([id, p]) => `<option value="${id}">${p.name}</option>`)
            .join('')}</select></label>
          <p id="form-error" class="error-message" role="alert" hidden></p>

          <label class="field">Key<select name="startingNote" id="key">${Array.from(
            { length: 73 },
            (_, i) => i + 24
          )
            .map((midi) => `<option value="${midi}">${noteName(midi)}</option>`)
            .join('')}</select></label>
          <fieldset id="direction" class="direction-field"><legend>Within each round</legend><div class="direction-toggle" id="phrase-options"></div></fieldset>
          <div id="range-heading" class="range-label"><span>Range</span><span class="range-actions"><button type="button" id="transpose-down" title="Move range and key down one semitone" aria-label="Transpose down one semitone"><i data-lucide="minus"></i></button><button type="button" id="transpose-up" title="Move range and key up one semitone" aria-label="Transpose up one semitone"><i data-lucide="plus"></i></button></span></div>
          <div id="note-range" class="field-row">${(['low', 'high'] as const).map((id) => `<div class="field small-label"><span>${id === 'low' ? 'Lowest' : 'Highest'}</span><div class="desktop-note"><input id="${id}-spin" type="text" role="combobox" aria-label="${id === 'low' ? 'Lowest' : 'Highest'} note" autocomplete="off" spellcheck="false" maxlength="5" /><button type="button" id="${id}-choose" aria-label="Choose ${id === 'low' ? 'lowest' : 'highest'} note"><i data-lucide="chevron-down"></i></button></div><div class="note-spinner mobile-note"><div class="note-wheel-selection" aria-hidden="true"></div><div id="${id}-wheel" class="note-wheel" role="spinbutton" tabindex="0" aria-label="${id === 'low' ? 'Lowest' : 'Highest'} note" aria-valuemin="24" aria-valuemax="96" aria-description="Swipe or scroll to choose a note."></div></div><input type="hidden" name="${id}" id="${id}" /></div>`).join('')}</div>
          <fieldset id="progression" class="direction-field progression-field"><legend>Between rounds</legend><div class="direction-toggle progression-toggle">${(
            [
              ['up', 'Rising', 'M4 21L60 3'],
              ['down', 'Falling', 'M4 3L60 21'],
              ['both', 'Rising then falling', 'M4 21L32 3L60 21'],
            ] as const
          )
            .map(
              ([value, label, path]) =>
                `<label><input type="radio" name="progression" value="${value}" /><svg class="progression-contour" viewBox="0 0 64 24" aria-hidden="true"><path d="${path}" /></svg><span>${label}</span></label>`
            )
            .join(
              ''
            )}</div><p class="progression-preview" id="progression-preview" aria-live="polite"></p></fieldset>
          <details class="more-settings"><summary>More options <i data-lucide="chevron-down"></i></summary><div class="advanced"><label id="starting-chords-field" class="toggle-row" hidden><span>Starting-note chords</span><input name="startingChords" id="startingChords" type="checkbox" role="switch" checked /></label>
            <div class="field-row">${[
              { id: 'repeat', key: 'repetitions', label: 'Repeats', max: 15 },
              { id: 'rest', key: 'restBeats', label: 'Rest (beats)', max: 16 },
            ]
              .map(
                ({ id, key, label, max }) =>
                  `<div class="field"><span>${label}</span><div class="desktop-count"><input id="${id}-count" class="count-input" type="number" min="0" max="${max}" step="1" aria-label="${label}" /><div class="count-arrows"><button type="button" data-count="${id}" data-step="1" aria-label="Increase ${id === 'repeat' ? 'repeats' : 'rest'}"><i data-lucide="chevron-up"></i></button><button type="button" data-count="${id}" data-step="-1" aria-label="Decrease ${id === 'repeat' ? 'repeats' : 'rest'}"><i data-lucide="chevron-down"></i></button></div></div><select id="${id}-select" class="mobile-count" aria-label="${label}">${Array.from({ length: 9 }, (_, value) => `<option value="${value}">${value === 0 ? 'None' : value}</option>`).join('')}</select><input name="${key}" id="${key}" type="hidden" /></div>`
              )
              .join('')}</div>
            <div class="field"><span>Count-in</span><button type="button" id="countIn-trigger" class="anchored-trigger" role="combobox" aria-label="Count-in"><span></span><i data-lucide="chevron-down"></i></button><select name="countIn" id="countIn" class="count-in-native" aria-label="Count-in"><option value="0">0 bars</option><option value="2">½ bar</option><option value="4">1 bar</option><option value="8">2 bars</option></select></div>
          </div></details>
        </form>
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
  <dialog id="how-dialog" class="dialog"><div class="dialog-top"><button class="icon-button close-dialog" aria-label="Close how it works"><i data-lucide="x"></i></button></div><h2>Help</h2><ol class="how-steps"><li>Choose an exercise, range, and tempo.</li><li>Press Play and follow the notes.</li><li>Adjust the exercise whenever you like.</li></ol><p class="field-hint">Shortcuts: Space to play or pause. R to restart. F for fullscreen.</p><p class="field-hint"><a href="${import.meta.env.BASE_URL}samples/bitklavier/NOTICE.txt" target="_blank" rel="noopener">bitKlavier Grand recordings &amp; credits · CC BY 4.0</a></p><p class="field-hint"><a href="${import.meta.env.BASE_URL}samples/vsco-cello/NOTICE.txt" target="_blank" rel="noopener">VSCO cello recordings &amp; credits · CC0</a></p></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;

$('.builder-column').insertAdjacentHTML('beforeend', `<section class="offline-section" aria-label="Offline use"><div><h2>Take it with you</h2><p id="offline-status" role="status">Preparing offline support…</p></div><button type="button" id="offline-download" class="quiet-button" disabled>Download for offline use</button><progress id="offline-progress" aria-label="Offline download progress" hidden></progress></section>`);
setupOffline();

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
const form = $<HTMLFormElement>('#exercise-form');
const countInSelect = new AnchoredSelect(
  $<HTMLSelectElement>('#countIn'),
  $<HTMLButtonElement>('#countIn-trigger')
);
const numeric = [
  'key',
  'low',
  'high',
  'bpm',
  'noteBeats',
  'repetitions',
  'restBeats',
  'countIn',
  'gate',
  'volume',
] as const;
const noteWheels = new Map(
  ['low', 'high'].map((id) => [
    id,
    new NoteWheel($(`#${id}-wheel`), (midi) => stepNote(id, 0, midi)),
  ])
);
const notePickers = new Map(
  ['low', 'high'].map((id) => [
    id,
    new NotePicker(
      $<HTMLInputElement>(`#${id}-spin`),
      $<HTMLButtonElement>(`#${id}-choose`),
      (midi) => stepNote(id, 0, midi)
    ),
  ])
);
function syncSpinners() {
  for (const id of ['low', 'high']) {
    const value = Number($<HTMLInputElement>(`#${id}`).value);
    noteWheels.get(id)!.setValue(value);
    notePickers.get(id)!.setValue(value);
  }
}
mobileQuery.addEventListener('change', () => syncSpinners());
function stepNote(id: string, step: number, absolute?: number) {
  const input = $<HTMLInputElement>(`#${id}`);
  input.value = String(Math.max(24, Math.min(96, absolute ?? Number(input.value) + step)));
  syncSpinners();
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
for (const id of ['low', 'high']) {
  $(`#${id}-wheel`).addEventListener('keydown', (event) => {
    const steps: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 12,
      PageDown: -12,
    };
    if (event.key in steps || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      stepNote(
        id,
        steps[event.key] ?? 0,
        event.key === 'Home' ? 24 : event.key === 'End' ? 96 : undefined
      );
    }
  });
}
function populate() {
  for (const [key, value] of Object.entries(spec)) {
    if (key === 'direction' || key === 'progression') continue;
    const element = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
    if (!element) continue;
    if (element instanceof HTMLInputElement && element.type === 'checkbox')
      element.checked = !!value;
    else element.value = value === null ? '' : String(value);
  }
  const options = (
    spec.pattern === 'major' || isGlidePattern(spec.pattern)
      ? ['up', 'down', 'both']
      : ['up', 'down']
  ) as Direction[];
  const markup = options
    .map((value) => {
      const contour = phraseContour(spec.pattern, value);
      const max = Math.max(...contour, 1);
      // Show the phrase's turning points, rather than every uneven note interval.
      const outline = contour.filter((note, index) =>
        index === 0 || index === contour.length - 1 ||
        Math.sign(note - contour[index - 1]) !== Math.sign(contour[index + 1] - note)
      );
      const points = outline
        .map(
          (note, index) => `${4 + (index * 56) / (outline.length - 1)},${21 - (note * 18) / max}`
        )
        .join(' ');
      return `<label><input type="radio" name="direction" value="${value}" /><svg class="phrase-contour" viewBox="0 0 64 24" aria-hidden="true"><polyline points="${points}" /></svg><span>${phraseLabel(spec.pattern, value)}</span></label>`;
    })
    .join('');
  const phraseOptions = $('#phrase-options');
  if (phraseOptions.dataset.pattern !== spec.pattern) {
    phraseOptions.innerHTML = markup;
    phraseOptions.dataset.pattern = spec.pattern;
  }
  phraseOptions.classList.toggle('three-options', options.length === 3);
  document.querySelectorAll<HTMLInputElement>('input[name="direction"]').forEach((input) => {
    input.checked = input.value === spec.direction;
  });
  document.querySelectorAll<HTMLInputElement>('input[name="progression"]').forEach((input) => {
    input.checked = input.value === (spec.progression ?? 'up');
  });
  const roots = progressionRoots(
    spec.low,
    spec.high - vocalSpan(spec.pattern),
    spec.progression ?? 'up'
  );
  const offset = spec.direction === 'down' ? vocalSpan(spec.pattern) : 0;
  const targets = roots.map((root) => noteName(root + offset, spec.key));
  const preview =
    targets.length <= 5
      ? targets.join(' → ')
      : spec.progression === 'both'
        ? `${targets[0]} → … → ${targets[Math.floor(targets.length / 2)]} → … → ${targets[targets.length - 1]}`
        : `${targets.slice(0, 3).join(' → ')} → … → ${targets[targets.length - 1]}`;
  $('#progression-preview').textContent =
    targets.length === 1 ? `${targets[0]} · one key` : preview;
  $('#progression').hidden = spec.pattern === 'major' || roots.length <= 1;
  syncSpinners();
  syncCounts();
  countInSelect.sync();
  syncTempoSteps();
  $<HTMLInputElement>('#tempo-slider').value = String(spec.bpm);
  const vocal = isVocalPattern(spec.pattern);
  const direction = $<HTMLFieldSetElement>('#direction');
  direction.hidden = spec.pattern === 'rossini';
  direction.disabled = spec.pattern === 'rossini';
  for (const id of ['key']) {
    const element = $<HTMLSelectElement>(`#${id}`);
    element.disabled = vocal;
    element.closest('.field')!.classList.toggle('vocal-hidden', vocal);
  }
  const keySelect = $<HTMLSelectElement>('#key');
  keySelect.value = String(spec.direction === 'down' ? spec.high : spec.low);
  for (const option of keySelect.options)
    option.disabled =
      spec.direction === 'down' ? Number(option.value) < 36 : Number(option.value) > 84;
  $('#range-heading').hidden = !vocal;
  $('#note-range').hidden = !vocal;
  if (vocal) syncSpinners();
  $('#starting-chords-field').hidden = !vocal;
  $<HTMLInputElement>('#startingChords').checked = spec.startingChords ?? true;
}
function readForm(): ExerciseSpec {
  const result = { ...spec, ...Object.fromEntries(new FormData(form)) } as Record<string, unknown>;
  for (const key of numeric) result[key] = Number(result[key]);
  if (
    result.pattern !== spec.pattern &&
    result.pattern !== 'major' &&
    !isGlidePattern(result.pattern as ExerciseSpec['pattern']) &&
    result.direction === 'both'
  )
    result.direction = 'up';
  result.progression = result.progression ?? 'up';
  if (
    isVocalPattern(result.pattern as ExerciseSpec['pattern']) &&
    result.pattern !== spec.pattern &&
    Number(result.high) - Number(result.low) < vocalSpan(result.pattern as ExerciseSpec['pattern'])
  ) {
    const span = vocalSpan(result.pattern as ExerciseSpec['pattern']);
    result.high = Math.min(96, Number(result.low) + span);
    result.low = Math.min(Number(result.low), Number(result.high) - span);
  }
  if (result.pattern === 'major') {
    const down = result.direction === 'down';
    const startingNote = Math.max(
      down ? 36 : 24,
      Math.min(down ? 96 : 84, Number(result.startingNote ?? (down ? result.high : result.low)))
    );
    result.key = startingNote % 12;
    result.low = down ? startingNote - 12 : startingNote;
    result.high = down ? startingNote : startingNote + 12;
  }
  result.gate = DEFAULT_SPEC.gate;
  result.noteBeats = DEFAULT_SPEC.noteBeats;
  result.transition = null;
  result.metronome = false;
  result.solfege = false;
  result.startingChords = $<HTMLInputElement>('#startingChords').checked;
  return generateExercise(result).spec;
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
  const el = $('#form-error');
  el.textContent = message;
  el.hidden = !message;
  $<HTMLButtonElement>('#play').disabled = !!message || pianoWarming;
}
function stop(reset = true) {
  ++playRequest;
  if (reset) player.reset();
  else player.pause();
}
function refresh() {
  stop();
  try {
    spec = readForm();
    exercise = generateExercise(spec);
    setError(null);
    persist();
    populate();
    void warmPiano();
    update();
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Check the exercise settings.');
  }
}
form.addEventListener('submit', (e) => e.preventDefault());
function changeTempo() {
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
form.addEventListener('change', refresh);
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
const countControls = [
  { id: 'repeat', key: 'repetitions', offset: 1, max: 15 },
  { id: 'rest', key: 'restBeats', offset: 0, max: 16 },
] as const;
function syncCounts() {
  for (const { id, key, offset, max } of countControls) {
    const value = spec[key] - offset;
    $<HTMLInputElement>(`#${id}-count`).value = String(value);
    const select = $<HTMLSelectElement>(`#${id}-select`);
    for (const option of [...select.options]) if (Number(option.value) > 8) option.remove();
    if (value > 8) select.add(new Option(String(value), String(value)));
    select.value = String(value);
    $<HTMLButtonElement>(`[data-count="${id}"][data-step="1"]`).disabled = value >= max;
    $<HTMLButtonElement>(`[data-count="${id}"][data-step="-1"]`).disabled = value <= 0;
  }
}
for (const { id, key, offset, max } of countControls) {
  for (const suffix of ['count', 'select']) {
    const element = $<HTMLInputElement | HTMLSelectElement>(`#${id}-${suffix}`);
    element.addEventListener('change', () => {
      $<HTMLInputElement>(`#${key}`).value = String(Number(element.value) + offset);
    });
  }
  for (const step of [-1, 1])
    $(`[data-count="${id}"][data-step="${step}"]`).addEventListener('click', () => {
      const input = $<HTMLInputElement>(`#${id}-count`);
      input.value = String(Math.max(0, Math.min(max, Number(input.value) + step)));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
for (const [id, change] of [
  ['transpose-down', -1],
  ['transpose-up', 1],
] as const)
  $(`#${id}`).addEventListener('click', () => {
    if (spec.low + change < 24 || spec.high + change > 96)
      return toast('That is the edge of the supported range.');
    spec = {
      ...spec,
      key: (spec.key + change + 12) % 12,
      low: spec.low + change,
      high: spec.high + change,
    };
    populate();
    refresh();
  });
let announced = '';
function update() {
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
    return `${noteName(round.midi, spec.key)}, range ${noteName(range.low, spec.key)} to ${noteName(range.high, spec.key)}`;
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
  $<HTMLButtonElement>('#play').disabled = pianoWarming || !$('#form-error').hidden;
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
  if (mode !== 'playing') return;
  position = player.position;
  update();
  raf = requestAnimationFrame(tick);
}
player.onStateChange = (state, nextPosition, reason) => {
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
      'input, select, textarea, button, summary, dialog, [role="spinbutton"]'
    ) ||
    document.querySelector('dialog[open]') ||
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
$('#how-button').addEventListener('click', () => $<HTMLDialogElement>('#how-dialog').showModal());
document
  .querySelectorAll<HTMLButtonElement>('.close-dialog')
  .forEach((button) => button.addEventListener('click', () => button.closest('dialog')!.close()));
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) =>
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  })
);
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
