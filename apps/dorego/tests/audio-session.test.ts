import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurePlaybackSession } from '../src/audio-session';

test('requests playback behavior and is safe to configure again', () => {
  const host = { audioSession: { type: 'auto' } };
  assert.equal(configurePlaybackSession(host), true);
  assert.equal(host.audioSession.type, 'playback');
  assert.equal(configurePlaybackSession(host), true);
});

test('unsupported, restricted and ignored session APIs do not block audio startup', () => {
  assert.equal(configurePlaybackSession({}), false);
  assert.equal(
    configurePlaybackSession({
      get audioSession(): never {
        throw new Error('Unavailable');
      },
    }),
    false
  );
  assert.equal(
    configurePlaybackSession({
      audioSession: {
        get type() {
          return 'auto';
        },
        set type(_value: string) {
          throw new Error('Restricted');
        },
      },
    }),
    false
  );
  assert.equal(
    configurePlaybackSession({
      audioSession: {
        get type() {
          return 'auto';
        },
        set type(_value: string) {},
      },
    }),
    false
  );
});
