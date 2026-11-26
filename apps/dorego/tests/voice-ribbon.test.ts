import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RibbonTracker, ribbonGuides } from '../src/voice-ribbon-model';
import { DEFAULT_SPEC, generateExercise } from '../src/music';
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
test('pitch ribbon confirms voiced runs, breaks uncertainty and never octave-corrects', () => {
  const t = new RibbonTracker();
  for (let i = 0; i < 6; i++) t.push(i * 0.01, i * 0.02, hz(60.5), 0.95);
  assert.equal(t.points.length, 0);
  t.push(0.06, 0.12, hz(60.5), 0.95);
  assert.ok(Math.abs(t.points[0].midi - 60.5) < 1e-9);
  const segment = t.points[0].segment;
  t.push(0.07, 0.14, hz(60), 0.2);
  assert.equal(t.points.length, 1);
  for (let i = 8; i <= 16; i++) t.push(i * 0.01, i * 0.02, hz(72), 0.95);
  assert.ok(t.points.at(-1)!.segment !== segment);
  assert.equal(t.points.at(-1)!.midi, 72);
  t.push(0.17, 0.34, NaN, 1);
  t.reset();
  assert.deepEqual(t.points, []);
});
test('ribbon uses fractional scale pitches and continuous glide geometry', () => {
  const maqam = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'maqamat',
    scaleTuning: 'bayati',
    low: 60,
    high: 72,
    countIn: 0,
    startingChords: false,
  });
  assert.ok(ribbonGuides(maqam, 0).some((g) => g.pitches[0] === 61.5));
  const glide = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'fifthGlide',
    low: 60,
    high: 67,
    countIn: 0,
    startingChords: false,
  });
  const guide = ribbonGuides(glide, 0).find((g) => g.pitches.length > 2)!;
  assert.ok(guide);
  assert.equal(Math.min(...guide.pitches), 60);
  assert.equal(Math.max(...guide.pitches), 67);
});
