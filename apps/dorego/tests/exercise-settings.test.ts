import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise } from '../src/music';
import { editSpec, restoreSpec } from '../src/exercise-settings';
const validate = (spec: unknown) => generateExercise(spec, Infinity).spec;
test('switching to a wider vocal phrase expands its range within supported bounds', () => {
  const next = validate(
    editSpec({ ...DEFAULT_SPEC, pattern: 'fiveNote', low: 90, high: 96 }, { pattern: 'rossini' })
  );
  assert.equal(next.high, 96);
  assert.equal(next.low, 77);
  assert.equal(next.pattern, 'rossini');
});
test('switching away from a bidirectional glide retains progression and selects a valid contour', () => {
  const next = validate(
    editSpec(
      { ...DEFAULT_SPEC, pattern: 'fifthGlide', direction: 'both', progression: 'down' },
      { pattern: 'pentatonic12' }
    )
  );
  assert.equal(next.direction, 'up');
  assert.equal(next.progression, 'down');
});
test('major starting-note and direction edits preserve sounding key and octave limits', () => {
  for (const direction of ['up', 'down'] as const) {
    const next = validate(
      editSpec({ ...DEFAULT_SPEC, pattern: 'major', direction }, { startingNote: 62 })
    );
    assert.equal(next.key, 2);
    assert.equal(next.low, direction === 'up' ? 62 : 50);
    assert.equal(next.high, direction === 'up' ? 74 : 62);
  }
});
test('invalid range edits remain invalid rather than silently changing the other bound', () => {
  assert.throws(
    () => validate(editSpec({ ...DEFAULT_SPEC, low: 52, high: 64 }, { low: 70 })),
    /range|lowest|low|high/i
  );
});
test('legacy glide migration and repeat preferences survive restoration', () => {
  const old = {
    ...DEFAULT_SPEC,
    pattern: 'fifthGlide',
    direction: 'up',
    repeatTurn: true,
    repeatHome: true,
    repeatTwice: true,
  };
  assert.equal(restoreSpec(old, null).direction, 'both');
  const next = restoreSpec(old, '1');
  assert.equal(next.direction, 'up');
  assert.equal(next.repeatTurn, true);
  assert.equal(next.repeatHome, true);
  assert.equal(next.repeatTwice, true);
});
