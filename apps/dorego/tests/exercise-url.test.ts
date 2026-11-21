import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC } from '../src/music';
import {
  applyExerciseRoute,
  readExerciseUrl,
  exerciseUrl,
  bindExerciseUrl,
  type UrlStore,
} from '../src/exercise-url';
const state = () => ({ spec: { ...DEFAULT_SPEC }, selected: 'warmup' as const });
const read = (path: string) => readExerciseUrl(new URL(path, 'https://example.com'))!;
test('every exercise and on-page selection round trips, including drones', () => {
  for (const path of [
    '/arpeggio-scale',
    '/octave-arpeggio',
    '/rossini',
    ...['5', '8'].map((n) => '/major/' + n),
    ...['6', '9', '12'].map((n) => '/pentatonic/' + n),
    '/glide/fifth',
    '/glide/octave',
    '/breathing',
    ...['hijaz', 'rast', 'bayati', 'ajam', 'nahawand', 'kurd', 'nikriz'].flatMap((m) => [
      '/maqamat/' + m,
      '/maqamat/' + m + '/drone',
    ]),
    ...['rast/4', 'rast/5', 'rast/8', 'bayati/4', 'bayati/5', 'bayati/8', 'sikah/3'].flatMap(
      (m) => ['/yemenite/' + m, '/yemenite/' + m + '/drone']
    ),
  ]) {
    const resolved = applyExerciseRoute(read(path), state());
    assert.equal(exerciseUrl(resolved), path, path);
  }
});
test('optional ranges use valid defaults, accept note names and MIDI, and preserve non-URL preferences', () => {
  const saved = { ...state(), spec: { ...DEFAULT_SPEC, low: 60, high: 64, bpm: 100 } };
  const next = applyExerciseRoute(read('/maqamat'), saved);
  assert.equal(next.spec.low, DEFAULT_SPEC.low);
  assert.equal(next.spec.bpm, 100);
  assert.equal(exerciseUrl(next), '/maqamat/hijaz');
  for (const range of ['low=C4&high=C5', 'low=60&high=72']) {
    const next = applyExerciseRoute(read('/major/8?' + range), state());
    assert.equal(next.spec.low, 60);
    assert.equal(next.spec.high, 72);
  }
  assert.equal(applyExerciseRoute(read('/major/8?high=C5'), state()).spec.low, 60);
  const sharp = applyExerciseRoute(read('/maqamat/bayati?low=F%233&high=F%234'), state());
  assert.match(exerciseUrl(sharp), /low=F%233/);
  const base = '/DoReGo/';
  const route = readExerciseUrl(new URL('https://example.com/DoReGo/yemenite'), base)!;
  assert.equal(exerciseUrl(applyExerciseRoute(route, state()), base), base + 'yemenite/bayati/8');
});
test('invalid choices and ranges fail without mutating saved state', () => {
  for (const path of [
    '/wat',
    '/yemenite/sikah/8',
    '/maqamat/major',
    '/major/3',
    '/maqamat/hijaz?low=bad',
    '/maqamat/hijaz?low=C1',
    '/maqamat/hijaz?low=C4&low=D4',
    '/major/8?low=C4&high=D4',
    '/maqamat/hijaz?low=C5&high=C4',
  ]) {
    assert.throws(() => applyExerciseRoute(read(path), state()), Error, path);
  }
  assert.equal(readExerciseUrl(new URL('https://example.com/')), null);
});
test('history restores controls, preserves settings hash, and explicit routes win initial account hydration', () => {
  const listeners = new Set<(source: 'local' | 'account' | 'url') => void>();
  const store: UrlStore = {
    state: state(),
    cloud: false,
    update(patch, source = 'local') {
      this.state = { ...this.state, ...patch };
      for (const fn of listeners) fn(source);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  let url = new URL('https://example.com/maqamat/bayati?low=C4&high=C5#settings');
  const entries: string[] = [];
  let pop: (() => void) | undefined;
  const browser = {
    get location() {
      return url;
    },
    history: {
      pushState(_a: unknown, _b: string, value: string) {
        entries.push(value);
        url = new URL(value, url);
      },
      replaceState(_a: unknown, _b: string, value: string) {
        url = new URL(value, url);
      },
    },
    addEventListener(_type: string, fn: () => void) {
      pop = fn;
    },
    removeEventListener() {
      pop = undefined;
    },
  } as unknown as Window;
  const binding = bindExerciseUrl(store, browser, '/', (message) => {
    throw new Error(message);
  });
  assert.equal(store.state.spec.scaleTuning, 'bayati');
  store.cloud = true;
  store.state = state();
  for (const fn of listeners) fn('account');
  assert.equal(store.state.spec.scaleTuning, 'bayati');
  assert.equal(store.state.spec.low, 60);
  store.update({ spec: { ...store.state.spec, bpm: 90 } });
  assert.equal(entries.length, 0);
  store.update({ spec: { ...store.state.spec, scaleTuning: 'rast' } });
  assert.equal(entries.length, 1);
  assert.match(url.href, /rast.*#settings$/);
  url = new URL('https://example.com/major/5');
  pop!();
  assert.equal(store.state.spec.pattern, 'fiveNote');
  assert.equal(entries.length, 1);
  binding.dispose();
  assert.equal(listeners.size, 0);
  // A root visit has no explicit URL intent: account restoration owns the choice.
  url = new URL('https://example.com/');
  store.cloud = false;
  store.state = state();
  const rootBinding = bindExerciseUrl(store, browser, '/');
  store.cloud = true;
  store.state = applyExerciseRoute(read('/glide/octave'), state());
  for (const fn of listeners) fn('account');
  assert.equal(url.pathname, '/glide/octave');
  rootBinding.dispose();
  // A choice made while initial account loading is pending is also explicit intent.
  url = new URL('https://example.com/');
  store.cloud = false;
  store.state = state();
  const pendingBinding = bindExerciseUrl(store, browser, '/');
  store.update(applyExerciseRoute(read('/yemenite/sikah/3'), store.state));
  store.cloud = true;
  store.state = state();
  for (const fn of listeners) fn('account');
  assert.equal(store.state.spec.yemeniteCollection, 'sikah-trichord');
  pendingBinding.dispose();
});
