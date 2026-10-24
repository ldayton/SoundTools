import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SampleLoader } from '../src/sample-loader';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

test('overlapping instrument loads share a limit and deduplicate samples', async () => {
  const loader = new SampleLoader(2);
  loader.select('piano', ['a', 'b']);
  loader.select('cello', ['c']);
  const first = deferred<number>(),
    second = deferred<number>();
  let calls = 0,
    thirdStarted = false;
  const a = loader.load('a', async () => {
    calls++;
    return first.promise;
  });
  const again = loader.load('a', async () => {
    throw new Error('duplicate');
  });
  assert.equal(a, again);
  const b = loader.load('b', () => second.promise);
  const c = loader.load('c', async () => {
    thirdStarted = true;
    return 3;
  });
  assert.equal(thirdStarted, false);
  first.resolve(1);
  assert.equal(await a, 1);
  assert.equal(await c, 3);
  second.resolve(2);
  assert.equal(await b, 2);
  assert.equal(calls, 1);
});

test('obsolete queued jobs never run; an uncancellable decode keeps its slot', async () => {
  const loader = new SampleLoader(1);
  const decode = deferred<number>();
  let obsoleteStarted = false,
    replacementStarted = false;
  loader.select('piano', ['old', 'queued']);
  const old = loader.load('old', () => decode.promise);
  const queued = loader.load('queued', async () => {
    obsoleteStarted = true;
    return 0;
  });
  const oldRejected = assert.rejects(old, { name: 'AbortError' });
  const queuedRejected = assert.rejects(queued, { name: 'AbortError' });
  loader.select('piano', ['new']);
  const replacement = loader.load('new', async () => {
    replacementStarted = true;
    return 4;
  });
  await queuedRejected;
  assert.equal(obsoleteStarted, false);
  assert.equal(replacementStarted, false);
  decode.resolve(1);
  await oldRejected;
  assert.equal(await replacement, 4);
});

test('shared required jobs survive selection changes and failed jobs can retry', async () => {
  const loader = new SampleLoader(1);
  loader.select('piano', ['shared']);
  loader.select('cello', ['shared']);
  const finish = deferred<number>();
  const shared = loader.load('shared', async (signal) => {
    const value = await finish.promise;
    assert.equal(signal.aborted, false);
    return value;
  });
  loader.select('piano', []);
  finish.resolve(5);
  assert.equal(await shared, 5);
  await assert.rejects(
    loader.load('shared', async () => {
      throw new Error('network');
    }),
    /network/
  );
  assert.equal(await loader.load('shared', async () => 6), 6);
});
