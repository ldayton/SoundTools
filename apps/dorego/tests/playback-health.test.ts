import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackHealth } from '../src/playback-health';

test('normal scheduling and short UI stalls retain playback', () => {
  const monitor = new PlaybackHealth(0, 0);
  for (const [audio, wall] of [
    [0.1, 100],
    [0.2, 200],
    [0.6, 600],
    [1.2, 1200],
  ])
    assert.equal(monitor.check(audio, wall, audio + 0.4), undefined);
});

test('a long delay pauses at the last safe checkpoint when an onset was missed', () => {
  const monitor = new PlaybackHealth(10, 1000);
  assert.deepEqual(monitor.check(13, 4000, 11.1), {
    reason: 'scheduling-gap',
    audioTime: 10,
  });
});

test('long already-scheduled notes and rests tolerate delayed timers', () => {
  const monitor = new PlaybackHealth(10, 1000);
  assert.equal(monitor.check(14, 5000, 16), undefined);
  assert.equal(monitor.check(19, 10000), undefined);
});

test('a context claiming to run with a frozen clock is detected', () => {
  const monitor = new PlaybackHealth(10, 1000);
  assert.equal(monitor.check(10, 2000, 11), undefined);
  assert.deepEqual(monitor.check(10, 2500, 11), {
    reason: 'clock-stalled',
    audioTime: 10,
  });
});

test('a progressing audio clock does not time out during a quiet passage', () => {
  const monitor = new PlaybackHealth(0, 0);
  for (let i = 1; i < 100; i++) assert.equal(monitor.check(i / 10, i * 100), undefined);
});
