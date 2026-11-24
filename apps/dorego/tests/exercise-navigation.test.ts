import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentExercise } from '../src/exercise-navigation';
test('media navigation follows sidebar exercises, normalizes families, and wraps through breathing', () => {
  assert.deepEqual(adjacentExercise('arpeggio', 'warmup', 1), {
    selected: 'warmup',
    pattern: 'octaveArpeggio',
  });
  assert.deepEqual(adjacentExercise('arpeggio', 'warmup', -1), { selected: 'breathSquares' });
  assert.deepEqual(adjacentExercise('yemenite', 'warmup', 1), { selected: 'breathSquares' });
  assert.deepEqual(adjacentExercise('rossini', 'breathSquares', 1), {
    selected: 'warmup',
    pattern: 'arpeggio',
  });
  assert.deepEqual(adjacentExercise('rossini', 'breathSquares', -1), {
    selected: 'warmup',
    pattern: 'yemenite',
  });
  assert.deepEqual(adjacentExercise('pentatonic12', 'warmup', 1), {
    selected: 'warmup',
    pattern: 'major',
  });
  assert.deepEqual(adjacentExercise('fiveNote', 'warmup', 1), {
    selected: 'warmup',
    pattern: 'fifthGlide',
  });
  assert.deepEqual(adjacentExercise('octaveGlide', 'warmup', -1), {
    selected: 'warmup',
    pattern: 'major',
  });
});
