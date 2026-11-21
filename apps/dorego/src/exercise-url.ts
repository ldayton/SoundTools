import {
  DEFAULT_SPEC,
  SCALE_TUNINGS,
  generateExercise,
  exerciseSpan,
  type ExerciseSpec,
  type Pattern,
} from './music';
import { restoreSpec, MIN_NOTE, MAX_NOTE } from './exercise-settings';
import { parseNote, noteChoiceLabel } from './note-spelling';
import { YEMENITE_COLLECTIONS, DEFAULT_YEMENITE_COLLECTION } from './yemenite-collections';

type Selected = 'warmup' | 'breathSquares';
type State = { spec: ExerciseSpec; selected: Selected };
type Route = { selected: Selected; patch: Partial<ExerciseSpec>; low?: number; high?: number };
export const EXERCISE_SLUGS = [
  'arpeggio-scale',
  'octave-arpeggio',
  'rossini',
  'pentatonic',
  'major',
  'glide',
  'maqamat',
  'yemenite',
  'breathing',
] as const;
const SIMPLE: Record<string, Pattern> = {
  'arpeggio-scale': 'arpeggio',
  'octave-arpeggio': 'octaveArpeggio',
  'rossini': 'rossini',
};
const fail = (message: string): never => {
  throw new Error(message);
};
function rangeValue(params: URLSearchParams, key: 'low' | 'high') {
  if (!params.has(key)) return undefined;
  if (params.getAll(key).length !== 1) return fail('Use one value for each range limit.');
  const value = params.get(key)!;
  const midi = /^\d+$/.test(value) ? Number(value) : parseNote(value);
  if (midi === null || !Number.isInteger(midi) || midi < MIN_NOTE || midi > MAX_NOTE)
    return fail('The link’s range must use notes from C2 through B6.');
  return midi;
}
export function readExerciseUrl(url: URL, base = '/'): Route | null {
  if (!base.endsWith('/')) base += '/';
  if (!url.pathname.startsWith(base)) return fail('This exercise link is outside the app.');
  const path = url.pathname.slice(base.length).replace(/\/+$/, '');
  if (!path || path === 'index.html') return null;
  let parts: string[];
  try {
    parts = path.split('/').map(decodeURIComponent);
  } catch {
    return fail('The exercise link is malformed.');
  }
  const drone = parts.at(-1) === 'drone';
  if (drone) parts.pop();
  const [slug, choice, extent] = parts;
  if (drone && slug !== 'maqamat' && slug !== 'yemenite')
    return fail('A tonic drone is only available for scale collections.');
  let patch: Partial<ExerciseSpec>;
  if (Object.hasOwn(SIMPLE, slug) && parts.length === 1) patch = { pattern: SIMPLE[slug] };
  else if (slug === 'major' && parts.length <= 2 && (!choice || ['5', '8'].includes(choice)))
    patch = { pattern: choice === '5' ? 'fiveNote' : 'major' };
  else if (
    slug === 'pentatonic' &&
    parts.length <= 2 &&
    (!choice || ['6', '9', '12'].includes(choice))
  )
    patch = { pattern: `pentatonic${choice ?? '6'}` as Pattern };
  else if (
    slug === 'glide' &&
    parts.length <= 2 &&
    (!choice || ['fifth', 'octave'].includes(choice))
  )
    patch = { pattern: choice === 'octave' ? 'octaveGlide' : 'fifthGlide' };
  else if (
    slug === 'maqamat' &&
    parts.length <= 2 &&
    (!choice || (choice !== 'major' && Object.hasOwn(SCALE_TUNINGS, choice)))
  )
    patch = { pattern: 'maqamat', scaleTuning: (choice ?? 'hijaz') as ExerciseSpec['scaleTuning'] };
  else if (slug === 'yemenite' && parts.length <= 3) {
    const family = choice ?? 'bayati';
    if (!['rast', 'bayati', 'sikah'].includes(family))
      return fail('Choose a supported Yemenite collection.');
    const notes =
      extent === undefined
        ? family === 'bayati'
          ? 8
          : family === 'sikah'
            ? 3
            : 5
        : Number(extent);
    const id = Object.entries(YEMENITE_COLLECTIONS).find(
      ([, item]) => item.family === family && item.extent === notes
    )?.[0];
    if (!id) return fail('That note count is not available for this Yemenite collection.');
    patch = { pattern: 'yemenite', yemeniteCollection: id as ExerciseSpec['yemeniteCollection'] };
  } else if (slug === 'breathing' && parts.length === 1) {
    return { selected: 'breathSquares', patch: {} };
  } else return fail('The link names an unknown exercise or selection.');
  return {
    selected: 'warmup',
    patch: { ...patch, drone },
    low: rangeValue(url.searchParams, 'low'),
    high: rangeValue(url.searchParams, 'high'),
  };
}
function defaults(patch: Partial<ExerciseSpec>, preferences: ExerciseSpec) {
  return restoreSpec(
    {
      ...preferences,
      pattern: 'arpeggio',
      low: DEFAULT_SPEC.low,
      high: DEFAULT_SPEC.high,
      key: DEFAULT_SPEC.key,
      ...patch,
    },
    '1'
  );
}
export function applyExerciseRoute(route: Route, state: State): State {
  if (route.selected === 'breathSquares') return { ...state, selected: route.selected };
  let spec = defaults(route.patch, state.spec);
  let low = route.low ?? spec.low,
    high = route.high ?? spec.high;
  const span = Math.ceil(exerciseSpan(spec));
  if (spec.pattern === 'major') {
    if (route.low !== undefined && route.high === undefined) high = low + 12;
    else if (route.high !== undefined && route.low === undefined) low = high - 12;
    if (high - low !== 12) return fail('The 8-note major scale link needs a one-octave range.');
  } else {
    if (route.low !== undefined && route.high === undefined) high = Math.max(high, low + span);
    if (route.high !== undefined && route.low === undefined) low = Math.min(low, high - span);
  }
  if (low < MIN_NOTE || high > MAX_NOTE || high - low < span)
    return fail('The link’s range is too small or outside C2–B6 for this exercise.');
  spec = generateExercise(
    { ...spec, low, high, key: spec.pattern === 'major' ? low % 12 : spec.key },
    Infinity
  ).spec;
  return { spec, selected: 'warmup' };
}
export function exerciseUrl(state: State, base = '/') {
  if (!base.endsWith('/')) base += '/';
  const { spec } = state;
  let path: string;
  if (state.selected === 'breathSquares') return base + 'breathing';
  if (spec.pattern === 'fiveNote' || spec.pattern === 'major')
    path = `major/${spec.pattern === 'fiveNote' ? 5 : 8}`;
  else if (spec.pattern.startsWith('pentatonic'))
    path = `pentatonic/${spec.pattern.slice(10)}`;
  else if (spec.pattern === 'fifthGlide' || spec.pattern === 'octaveGlide')
    path = `glide/${spec.pattern === 'fifthGlide' ? 'fifth' : 'octave'}`;
  else if (spec.pattern === 'maqamat')
    path = `maqamat/${spec.scaleTuning && spec.scaleTuning !== 'major' ? spec.scaleTuning : 'hijaz'}`;
  else if (spec.pattern === 'yemenite') {
    const collection = YEMENITE_COLLECTIONS[spec.yemeniteCollection ?? DEFAULT_YEMENITE_COLLECTION];
    path = `yemenite/${collection.family}/${collection.extent}`;
  } else path = Object.keys(SIMPLE).find((slug) => SIMPLE[slug] === spec.pattern)!;
  if ((spec.pattern === 'maqamat' || spec.pattern === 'yemenite') && spec.drone) path += '/drone';
  const route = readExerciseUrl(new URL('https://dorego.invalid' + base + path), base)!;
  const normal = defaults(route.patch, spec);
  const query = new URLSearchParams();
  if (spec.low !== normal.low) query.set('low', noteChoiceLabel(spec.low).replace('♯', '#'));
  if (spec.high !== normal.high) query.set('high', noteChoiceLabel(spec.high).replace('♯', '#'));
  return base + path + (query.size ? '?' + query : '');
}

type Source = 'local' | 'account' | 'url';
export type UrlStore = {
  state: State;
  cloud: boolean;
  update(patch: Partial<State>, source?: 'local' | 'url'): void;
  subscribe(listener: (source: Source) => void): () => void;
};
type Browser = Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>;
/** Structural URL changes have their own source so playback applies Back/Forward. */
export function bindExerciseUrl(
  store: UrlStore,
  browser: Browser,
  base: string,
  onError: (message: string) => void = () => {}
) {
  let applying = false,
    awaitingCloud = true;
  let pending: Route | null = null;
  const current = () => browser.location.pathname + browser.location.search + browser.location.hash;
  const desired = () => {
    const url = new URL(exerciseUrl(store.state, base), browser.location.origin);
    for (const [key, value] of new URL(browser.location.href).searchParams)
      if (key !== 'low' && key !== 'high') url.searchParams.append(key, value);
    return url.pathname + url.search + browser.location.hash;
  };
  const write = (replace: boolean) => {
    const next = desired();
    if (next !== current()) browser.history[replace ? 'replaceState' : 'pushState'](null, '', next);
  };
  const apply = (route: Route) => {
    const next = applyExerciseRoute(route, store.state);
    applying = true;
    try {
      store.update(next, 'url');
    } finally {
      applying = false;
    }
  };
  try {
    pending = readExerciseUrl(new URL(browser.location.href), base);
    if (pending) apply(pending);
  } catch (error) {
    queueMicrotask(() => onError((error as Error).message));
  }
  write(true);
  const unsubscribe = store.subscribe((source) => {
    if (applying) return;
    if (source === 'account' && store.cloud && awaitingCloud) {
      awaitingCloud = false;
      const intent = pending;
      pending = null;
      if (intent) apply(intent);
      write(true);
    } else {
      if (source === 'local' && desired() !== current() && awaitingCloud)
        pending = readExerciseUrl(new URL(desired(), browser.location.origin), base);
      write(source === 'account');
    }
  });
  const pop = () => {
    try {
      const route = readExerciseUrl(new URL(browser.location.href), base);
      pending = awaitingCloud ? route : null;
      if (route) apply(route);
      write(true);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  browser.addEventListener('popstate', pop);
  return {
    dispose() {
      unsubscribe();
      browser.removeEventListener('popstate', pop);
    },
  };
}
