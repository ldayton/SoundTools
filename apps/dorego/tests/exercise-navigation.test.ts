import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentExercise } from '../src/exercise-navigation';
test('media navigation follows sidebar exercises, normalizes families, and wraps through breathing', () => {
  assert.deepEqual(adjacentExercise('octaveArpeggio', 'warmup', 1), {
    selected: 'warmup',
    pattern: 'rossini',
  });
  assert.deepEqual(adjacentExercise('octaveArpeggio', 'warmup', -1), { selected: 'breathSquares' });
  assert.deepEqual(adjacentExercise('yemenite', 'warmup', 1), { selected: 'breathSquares' });
  assert.deepEqual(adjacentExercise('rossini', 'breathSquares', 1), {
    selected: 'warmup',
    pattern: 'octaveArpeggio',
  });
  assert.deepEqual(adjacentExercise('rossini', 'breathSquares', -1), {
    selected: 'warmup',
    pattern: 'yemenite',
  });
  assert.deepEqual(adjacentExercise('pentatonic12', 'warmup', 1), {
    selected: 'warmup',
    pattern: 'fifthGlide',
  });
  assert.deepEqual(adjacentExercise('fiveNote', 'warmup', 1), {
    selected: 'warmup',
    pattern: 'maqamat',
  });
  assert.deepEqual(adjacentExercise('octaveGlide', 'warmup', -1), {
    selected: 'warmup',
    pattern: 'pentatonic6',
  });
});
