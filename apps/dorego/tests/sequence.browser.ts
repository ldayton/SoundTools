import assert from 'node:assert/strict';
import type { Browser } from 'playwright';
import { newPage, waitForApp, captureFailure } from '../../../scripts/ci/browser-harness.cjs';
import { DEFAULT_SPEC } from '../src/music';

/** One real scheduler witness; the pure sequence tests own the exercise/option matrix. */
export async function verifySequence(browser: Browser, base: string) {
  const page = await newPage(browser, { viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    (spec) => {
      localStorage.setItem('dorego.current', JSON.stringify(spec));
      localStorage.setItem('dorego.glideShapeVersion', '1');
      const sources: any[] = [];
      (window as any).sequenceSources = sources;
      const start = AudioBufferSourceNode.prototype.start;
      const stop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.start = function (...args: any[]) {
        const source = {
          node: this,
          ended: false,
          canceled: 0,
          at: args[0] ?? this.context.currentTime,
        };
        sources.push(source);
        this.addEventListener('ended', () => (source.ended = true));
        return start.apply(this, args as any);
      };
      AudioBufferSourceNode.prototype.stop = function (at?: number) {
        const source = sources.find((source) => source.node === this);
        if (source && (at === undefined || at <= this.context.currentTime + 0.001))
          source.canceled++;
        return stop.call(this, at);
      };
    },
    {
      ...DEFAULT_SPEC,
      pattern: 'fifthGlide',
      direction: 'up',
      progression: 'up',
      low: 60,
      high: 73,
      bpm: 240,
      countIn: 0,
      restBeats: 0,
      repetitions: 1,
      startingChords: false,
    }
  );
  let releaseSamples!: () => void;
  const samplesGate = new Promise<void>((resolve) => {
    releaseSamples = resolve;
  });
  let requested!: () => void;
  const sampleRequested = new Promise<void>((resolve) => {
    requested = resolve;
  });
  try {
    await page.goto(base);
    await waitForApp(page, '#play:enabled');
    await page.locator('#play').click();
    await page.waitForFunction(
      () => Number(document.querySelector('#elapsed')?.getAttribute('data-seconds')) > 0.1
    );
    const held = await page.evaluate(() => {
      const sources = (window as any).sequenceSources;
      return sources.findIndex(
        (source: any) =>
          source.node.loop && !source.ended && source.at <= source.node.context.currentTime
      );
    });
    assert.ok(held >= 0, 'A real sustained glide is sounding');
    const current = await page.locator('.practice-pitch.current').textContent();
    const before = Number(await page.locator('#elapsed').getAttribute('data-seconds'));
    await page.route('**/samples/**/*.flac', async (route) => {
      requested();
      await samplesGate;
      await route.continue();
    });
    await page.locator('#glide-interval').click();
    await page.getByRole('option', { name: 'Octave', exact: true }).click();
    await page.locator('#startingChords').check();
    await page.locator('#rest-count').fill('4');
    await page.locator('#rest-count').press('Tab');
    await page.locator('#countIn').selectOption('8');
    assert.equal(await page.locator('#play').getAttribute('data-mode'), 'playing');
    assert.equal(await page.locator('.practice-pitch.current').textContent(), current);
    assert.match(
      (await page.locator('.practice-pitch.next .practice-pitch-range').textContent())!,
      /5$/,
      'The octave variant belongs to the next round'
    );
    assert.ok(Number(await page.locator('#elapsed').getAttribute('data-seconds')) >= before);
    assert.equal(
      await page.evaluate((index) => (window as any).sequenceSources[index].canceled, held),
      0
    );
    assert.equal(await page.locator('#stage').getAttribute('data-counting'), 'false');
    const duration = Number(await page.locator('#elapsed').getAttribute('data-duration'));
    // Two eight-beat glides, one new six-beat intro, and one four-beat rest; no new count-in.
    assert.equal(duration, (26 * 60) / 240);
    await sampleRequested;
    await page.getByText('Preparing next round…', { exact: true }).waitFor();
    assert.equal(
      await page.locator('#play').getAttribute('data-mode'),
      'playing',
      'Loading future samples does not stop the current sequence'
    );
    releaseSamples();
    await page.unrouteAll({ behavior: 'wait' });
    await page.waitForFunction(
      () => document.querySelector('#exercise-summary')?.textContent === 'Round 2 of 2'
    );
    const secondAt = Number(await page.locator('#elapsed').getAttribute('data-seconds'));
    assert.ok(secondAt >= (12 * 60) / 240, 'The new inter-round rest precedes round two');
    await page.waitForFunction(() =>
      (window as any).sequenceSources.some(
        (source: any) =>
          !source.node.loop &&
          !source.ended &&
          source.node.buffer?.duration > 0.1 &&
          source.at <= source.node.context.currentTime
      )
    );
    assert.equal(
      await page.evaluate((index) => (window as any).sequenceSources[index].canceled, held),
      0,
      'No current-round cancellation at the transition'
    );
    await page.locator('#play').click();
    const paused = await page.locator('#elapsed').getAttribute('data-seconds');
    await page.locator('#startingChords').uncheck();
    assert.equal(await page.locator('#play').getAttribute('data-mode'), 'paused');
    assert.equal(await page.locator('#elapsed').getAttribute('data-seconds'), paused);
    await page.getByRole('button', { name: 'Repeat round', exact: true }).click();
    await page.getByText('Rest · repeat round in', { exact: true }).waitFor();
    assert.equal(
      Number(await page.locator('#elapsed').getAttribute('data-duration')),
      (20 * 60) / 240,
      'Repeat rebuilds the current round without the chords just switched off'
    );
    await page.waitForFunction(
      () => Number(document.querySelector('#elapsed')?.getAttribute('data-seconds')) > 3.05
    );
    assert.equal(await page.locator('#exercise-summary').textContent(), 'Round 2 of 2');
    assert.equal(await page.locator('#stage').getAttribute('data-counting'), 'false');
    await page.locator('#restart').click();
    await page.locator('#play').click();
    await page.waitForFunction(
      () => document.querySelector('#stage')?.getAttribute('data-counting') === 'true'
    );
    await page.locator('#play').click();
    assert.deepEqual(errors, []);
    console.log(
      'PASS shared sequence: options retain sounding source; next round gets new chords/rest after deferred samples; count-in waits for restart; paused edits stay paused.'
    );
  } catch (error) {
    await captureFailure(browser, error);
    throw error;
  } finally {
    releaseSamples();
    await page.close();
  }
}
