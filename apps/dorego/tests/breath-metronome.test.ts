import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BreathMetronome, upcomingSeconds } from '../src/breath-metronome';
import { createBreathSession } from '../src/breath-squares';

test('second lookahead schedules boundaries once, skips missed ticks, and includes the finish', () => {
  assert.deepEqual(upcomingSeconds(0, 4, 0), { seconds: [0], next: 1 });
  assert.deepEqual(upcomingSeconds(0.9, 4, 1), { seconds: [1], next: 2 });
  assert.deepEqual(upcomingSeconds(0.95, 4, 2), { seconds: [], next: 2 });
  assert.deepEqual(upcomingSeconds(3.9, 4, 2), { seconds: [4], next: 5 });
  assert.deepEqual(upcomingSeconds(4, 4, 5), { seconds: [], next: 5 });
});
function fakeAudio() {
  const sources: { at: number; cancelled: boolean }[] = [];
  const levels: number[] = [];
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    addEventListener() {},
    removeEventListener() {},
    resume: async () => {},
    close: async () => {},
    createGain: () => ({
      gain: {
        setTargetAtTime: (value: number) => levels.push(value),
        cancelScheduledValues() {},
        setValueAtTime: (value: number) => levels.push(value),
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect(node: unknown) {
        return node;
      },
      disconnect() {},
    }),
    createOscillator: () => {
      const entry = { at: -1, cancelled: false };
      sources.push(entry);
      return {
        frequency: { value: 0 },
        onended: null,
        connect(node: unknown) {
          return node;
        },
        disconnect() {},
        start: (at: number) => {
          entry.at = at;
        },
        stop: (at?: number) => {
          if (at === undefined) entry.cancelled = true;
        },
      };
    },
  };
  return { context, sources, levels };
}
test('pause cancels lookahead; resume preserves the next second and volume can mute pending clicks', () => {
  const { context, sources, levels } = fakeAudio();
  let volume = -6;
  const metronome = new BreathMetronome(
    () => volume,
    () => assert.fail('Unexpected audio error'),
    () => context as unknown as AudioContext
  );
  const base = createBreathSession({ rounds: 1, seconds: 1 }).getSnapshot();
  const sync = (position: number, mode: typeof base.mode = 'playing') => {
    context.currentTime = position;
    metronome.sync({ ...base, position, mode });
  };
  try {
    sync(0);
    sync(0.9);
    assert.equal(sources.length, 2);
    assert.ok(Math.abs(sources[1].at - 1) < 1e-10);
    sync(0.95, 'paused');
    assert.ok(sources.every((source) => source.cancelled));
    sync(0.95);
    assert.equal(sources.length, 3);
    assert.equal(sources[2].at, 1);
    volume = -60;
    sync(0.96);
    assert.equal(levels.at(-1), 0);
    sync(1, 'paused');
    sync(1);
    assert.equal(sources.length, 3, 'No repeated tick on an exact-boundary resume');
    sync(3.9);
    assert.equal(sources.at(-1)!.at, 4);
    sync(4, 'complete');
    assert.equal(sources.at(-1)!.cancelled, false, 'Final tick is allowed to finish');
    sync(0, 'ready');
    assert.equal(sources.at(-1)!.cancelled, true);
  } finally {
    metronome.dispose();
  }
});
test('a rejected audio start is reported once and cancels its scheduled sources', async () => {
  const { context, sources } = fakeAudio();
  context.resume = async () => {
    throw new Error('Blocked');
  };
  let failures = 0;
  const metronome = new BreathMetronome(
    () => -12,
    () => failures++,
    () => context as unknown as AudioContext
  );
  const session = createBreathSession(null);
  session.toggle();
  metronome.sync(session.getSnapshot());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(failures, 1);
  assert.ok(sources.every((source) => source.cancelled));
  metronome.dispose();
});
