import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breathAt, breathSettings, createBreathSession } from '../src/breath-squares';

test('four equal steps repeat clockwise and stop after exactly the requested rounds', () => {
  let now = 0;
  const session = createBreathSession({ rounds: 2, seconds: 3 }, () => now);
  assert.equal(breathAt(session.getSnapshot()).active, false);
  session.toggle();
  session.audioReady();
  for (let step = 0; step < 8; step++) {
    now = step * 3000;
    session.tick();
    const at = breathAt(session.getSnapshot());
    assert.equal(at.phase, step % 4);
    assert.equal(at.round, Math.floor(step / 4) + 1);
    assert.equal(at.remaining, 3);
    now += 2100;
    session.tick();
    assert.equal(breathAt(session.getSnapshot()).remaining, 1);
  }
  now = 24000;
  session.tick();
  assert.equal(session.getSnapshot().mode, 'complete');
  assert.equal(breathAt(session.getSnapshot()).active, false);
  assert.equal(session.getSnapshot().position, 24);
  session.toggle();
  session.audioReady();
  assert.equal(session.getSnapshot().position, 0);
  assert.equal(breathAt(session.getSnapshot()).phase, 0);
});
test('pause preserves partial seconds; delayed ticks use elapsed time without extending the session', () => {
  let now = 100;
  const session = createBreathSession({ rounds: 1, seconds: 4 }, () => now);
  session.toggle();
  session.audioReady();
  now += 1750;
  session.pause();
  const paused = session.getSnapshot();
  assert.equal(paused.mode, 'paused');
  assert.equal(paused.position, 1.75);
  now += 100000;
  session.tick();
  assert.deepEqual(session.getSnapshot(), paused);
  session.toggle();
  session.audioReady();
  now += 2250;
  session.tick();
  assert.equal(breathAt(session.getSnapshot()).phase, 1);
  now += 20000;
  session.pause();
  assert.equal(session.getSnapshot().mode, 'complete');
  assert.equal(session.getSnapshot().position, 16);
});
test('reset and settings edits clear progress, with invalid saved values falling back safely', () => {
  const session = createBreathSession({ rounds: 1, seconds: 1 });
  session.toggle();
  session.audioReady();
  session.reset();
  assert.equal(session.getSnapshot().mode, 'ready');
  session.toggle();
  session.audioReady();
  session.configure({ rounds: 3, seconds: 5 });
  assert.equal(session.getSnapshot().mode, 'ready');
  assert.equal(breathAt(session.getSnapshot()).duration, 60);
  for (const input of [null, [], 'bad', { rounds: 0, seconds: 999 }, { rounds: 1.5, seconds: NaN }])
    assert.deepEqual(breathSettings(input), { rounds: 4, seconds: 4 });
});
test('the timer waits for audio readiness and then follows the device clock', () => {
  let wall = 0,
    audio = 0;
  const session = createBreathSession(null, () => wall);
  session.toggle();
  wall = 10000;
  session.tick();
  assert.equal(session.getSnapshot().mode, 'starting');
  assert.equal(session.getSnapshot().position, 0);
  session.audioReady(() => audio);
  wall += 5000;
  session.tick();
  assert.equal(session.getSnapshot().position, 0, 'A delayed device clock cannot shorten a second');
  audio += 1000;
  session.tick();
  assert.equal(session.getSnapshot().position, 1);
  session.reset();
  session.toggle();
  session.pause();
  session.audioReady();
  assert.equal(
    session.getSnapshot().mode,
    'paused',
    'Late readiness cannot restart a paused exercise'
  );
});
