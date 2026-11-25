import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioReadinessError, verifyAudioReady } from '../src/audio-readiness';

test('a rendering clock must advance after resume, even if the context reports running', async () => {
  let time = 4;
  assert.equal(
    await verifyAudioReady(
      {
        state: 'running',
        get currentTime() {
          return (time += 0.02);
        },
      },
      async () => {},
      () => true,
      { probeMs: 1 }
    ),
    true
  );
  await assert.rejects(
    verifyAudioReady(
      { state: 'running', currentTime: 4 },
      async () => {},
      () => true,
      { probeMs: 1 }
    ),
    (error: AudioReadinessError) => error.failure === 'clock_stalled'
  );
});
test('a hung resume has a deadline and a late rejection is consumed', async () => {
  let rejectOld!: (error: Error) => void;
  const resume = new Promise<void>((_, reject) => {
    rejectOld = reject;
  });
  await assert.rejects(
    verifyAudioReady(
      { state: 'suspended', currentTime: 0 },
      () => resume,
      () => true,
      { timeoutMs: 5 }
    ),
    (error: AudioReadinessError) => error.failure === 'resume_timeout'
  );
  rejectOld(Error('late failure'));
});
test('superseded startup cannot report a failure or validate the newer context', async () => {
  let active = true,
    finish!: () => void;
  const pending = verifyAudioReady(
    { state: 'running', currentTime: 0 },
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    () => active,
    { timeoutMs: 5 }
  );
  active = false;
  assert.equal(await pending, false);
  finish();
});
test('resume rejection and interruption are distinguished from a running clock failure', async () => {
  const cause = Error('PRIVATE');
  await assert.rejects(
    verifyAudioReady(
      { state: 'suspended', currentTime: 0 },
      () => Promise.reject(cause),
      () => true
    ),
    (error: AudioReadinessError) => error.failure === 'resume_rejected' && error.cause === cause
  );
  await assert.rejects(
    verifyAudioReady(
      { state: 'interrupted', currentTime: 0 },
      async () => {},
      () => true
    ),
    (error: AudioReadinessError) => error.failure === 'not_running'
  );
});
test('resume is invoked inside the caller gesture, before yielding', async () => {
  let called = false;
  const result = verifyAudioReady(
    { state: 'running', currentTime: 1 },
    () => {
      called = true;
      return Promise.resolve();
    },
    () => true,
    { probeMs: 0 }
  );
  assert.equal(called, true);
  assert.equal(await result, true);
});
