import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindMediaSession } from '../src/media-session';

test('system transport actions and metadata reflect app playback', () => {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  const session = {
    playbackState: 'none' as MediaSessionPlaybackState,
    metadata: null as MediaMetadata | null,
    setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      handlers.set(action, handler);
    },
  };
  let played = 0,
    paused = 0,
    made = 0;
  const update = bindMediaSession(
    session,
    (title) => {
      made++;
      return { title } as MediaMetadata;
    },
    {
      play: () => {
        played++;
      },
      pause: () => {
        paused++;
      },
    }
  );
  update('Octave Arpeggio', 'playing');
  assert.equal(session.metadata?.title, 'Octave Arpeggio');
  assert.equal(session.playbackState, 'playing');
  handlers.get('pause')!({ action: 'pause' });
  handlers.get('play')!({ action: 'play' });
  assert.equal(played, 1);
  assert.equal(paused, 1);
  update('Octave Arpeggio', 'paused');
  assert.equal(session.playbackState, 'paused');
  assert.equal(made, 1);
  update('Maqamat', 'complete');
  assert.equal(session.metadata?.title, 'Maqamat');
  assert.equal(session.playbackState, 'none');
  update('', 'ready');
  assert.equal(session.metadata, null, 'Leaving vocal exercises clears their system metadata');
});

test('unavailable system media integration leaves app controls usable', () => {
  const actions = { play() {}, pause() {} };
  bindMediaSession(
    undefined,
    () => {
      throw Error('Unavailable');
    },
    actions
  )('Exercise', 'playing');
  const session = {
    setActionHandler() {
      throw Error('Unsupported');
    },
    playbackState: 'none' as MediaSessionPlaybackState,
    metadata: null,
  };
  assert.doesNotThrow(() =>
    bindMediaSession(
      session,
      () => {
        throw Error('Unavailable');
      },
      actions
    )('Exercise', 'playing')
  );
});

test('system seeking, round navigation and timeline follow the exercise clock', () => {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  const positions: (MediaPositionState | undefined)[] = [];
  const session = {
    playbackState: 'none' as MediaSessionPlaybackState,
    metadata: null as MediaMetadata | null,
    setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
      handlers.set(action, handler);
    },
    setPositionState(state?: MediaPositionState) {
      positions.push(state);
    },
  };
  const sought: number[] = [];
  let round = 1;
  const update = bindMediaSession(session, (title) => ({ title }) as MediaMetadata, {
    play() {},
    pause() {},
    seek: (seconds) => {
      sought.push(seconds);
    },
    next: () => {
      round++;
    },
    previous: () => {
      round--;
    },
  });
  handlers.get('seekto')!({ action: 'seekto', seekTime: 12.5 });
  handlers.get('seekto')!({ action: 'seekto', seekTime: NaN });
  handlers.get('seekto')!({ action: 'seekto' });
  assert.deepEqual(sought, [12.5]);
  handlers.get('nexttrack')!({ action: 'nexttrack' });
  assert.equal(round, 2);
  handlers.get('previoustrack')!({ action: 'previoustrack' });
  assert.equal(round, 1);
  update('Warm-up', 'playing', { duration: 60, position: 5 });
  assert.deepEqual(positions, [{ duration: 60, position: 5, playbackRate: 1 }]);
  update('Warm-up', 'playing', { duration: 60, position: 5.1 });
  assert.equal(positions.length, 1, 'The OS clock interpolates between updates');
  update('Warm-up', 'paused', { duration: 60, position: 5.25 });
  assert.deepEqual(positions.at(-1), { duration: 60, position: 5.25, playbackRate: 1 });
  update('Warm-up', 'paused', { duration: 60, position: 200 });
  assert.equal(positions.at(-1)?.position, 60);
  update('Warm-up', 'paused', { duration: 60, position: -2 });
  assert.equal(positions.at(-1)?.position, 0);
  update('Warm-up', 'playing', { duration: 90, position: 0.5 });
  assert.deepEqual(positions.at(-1), { duration: 90, position: 0.5, playbackRate: 1 });
  update('', 'ready');
  assert.equal(positions.at(-1), undefined);
});
