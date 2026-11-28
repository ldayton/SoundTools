import assert from 'node:assert/strict';
import type { Browser } from 'playwright';
import { newPage, waitForApp, captureFailure } from '../../../scripts/ci/browser-harness.cjs';
import { DEFAULT_SPEC } from '../src/music';
import { openPracticeOptions, closePracticeOptions } from './ui-helpers';

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
    await verifyExerciseNavigation(browser, base);
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

/** The shared native pager must work from empty space and playable piano pads. */
export async function verifyExerciseNavigation(browser: Browser, base: string) {
  const page = await newPage(browser, { viewport: { width: 1440, height: 1000 }, hasTouch: true });
  await page.addInitScript(spec => {
    localStorage.setItem('dorego.current', JSON.stringify(spec));
    localStorage.setItem('dorego.glideShapeVersion', '1');
  }, { ...DEFAULT_SPEC, pattern: 'octaveArpeggio', low: 52, high: 77, countIn: 0 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base);
    await waitForApp(page, '#play:enabled');
    assert.deepEqual(await page.locator('[data-pattern]').evaluateAll(elements => elements.map(element => element.getAttribute('data-pattern'))), ['octaveArpeggio', 'rossini', 'pentatonic6', 'fifthGlide', 'arpeggio', 'major', 'maqamat', 'yemenite', 'breathSquares']);
    const icons = await page.evaluate(() => {
      const settings = document.querySelector('[data-settings] svg')!.getBoundingClientRect();
      const account = document.querySelector('[data-account-entry] svg')!.getBoundingClientRect();
      return { settingsX: settings.x + settings.width / 2, accountX: account.x + account.width / 2, settingsY: settings.y, accountY: account.y };
    });
    assert.ok(Math.abs(icons.settingsX - icons.accountX) < 1 && icons.accountY > icons.settingsY, 'Account and Settings icons share a column');
    const order = await page.evaluate(() => ['startingChords', 'repeatTwice', 'repeatTurn', 'repeatHome', 'range-heading', 'voice-feedback'].map(id => document.getElementById(id)!.getBoundingClientRect().y));
    assert.ok(order.every((y, index) => index === 0 || y > order[index - 1]), 'Frequent controls come first; voice feedback comes last');
    assert.equal(await page.getByRole('img', { name: 'Experimental', exact: true }).count(), 1);
    assert.ok(await page.getByLabel('Beta features', { exact: true }).locator('#voice-feedback').count() === 1);
    for (const id of ['startingChords', 'repeatTwice', 'repeatTurn', 'repeatHome']) await page.locator('#' + id).check();
    await page.setViewportSize({ width: 390, height: 844 });
    const track = page.locator('.dorego-exercise-pager .swipe-pager');
    await page.waitForFunction(() => {
      const r = document.querySelector('.swipe-pager')!.getBoundingClientRect();
      const header = document.querySelector('header')!.getBoundingClientRect();
      return Math.abs(r.width - innerWidth) < 1 && Math.abs(r.y - header.bottom) < 1 && Math.abs(r.bottom - innerHeight) < 1;
    });
    const swipe = async (dx: number, y: number, startX = dx < 0 ? 320 : 70, vertical = 0, reverse = false) => {
      await track.evaluate(element => {
        element.setAttribute('data-test-scroll-settled', 'false');
        element.addEventListener('scrollend', () => element.setAttribute('data-test-scroll-settled', 'true'), { once: true });
      });
      if (browser.browserType().name() === 'chromium') {
        const session = await page.context().newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] });
        // Deliver physical touch movement across compositor frames, not coalesced into one frame.
        for (const fraction of [.3, .65, 1]) {
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + dx * fraction, y: y + vertical * fraction }] });
        }
        await session.send('Input.dispatchTouchEvent', { type: reverse ? 'touchCancel' : 'touchEnd', touchPoints: [] });
        await session.detach();
      } else if (!reverse) {
        // WebKit automation lacks native touch injection; use its native horizontal wheel.
        const bounds = (await track.boundingBox())!;
        await page.mouse.move(startX, y);
        await page.mouse.wheel(-Math.sign(dx) * bounds.width, 0);
      }
      if (vertical) await page.waitForFunction(() => (document.querySelector('.swipe-pager-page:not([inert])')?.scrollTop ?? 0) > 0);
      else await page.waitForFunction(() => document.querySelector('.swipe-pager')?.getAttribute('data-test-scroll-settled') === 'true');
    };
    const selected = async (pattern: string) => {
      await page.waitForFunction(pattern => JSON.parse(localStorage.getItem('dorego.current') || '{}').pattern === pattern, pattern);
      await page.waitForFunction(pattern => document.querySelector('.swipe-pager-page:not([inert])')?.getAttribute('data-page') === pattern, pattern);
      assert.equal(await page.locator('#play').count(), 1, 'Only the active page owns playback controls');
    };
    await page.locator('#play').click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await swipe(-250, 720);
    await selected('rossini');
    assert.equal(await page.locator('#play').getAttribute('data-mode'), 'ready', 'Swiping stops the previous exercise without auto-playing the next');
    if (browser.browserType().name() === 'chromium') {
      await page.setViewportSize({ width: 390, height: 500 });
      await page.waitForFunction(() => document.querySelector('.swipe-pager')!.getBoundingClientRect().bottom === innerHeight);
      await swipe(0, 450, 195, -220);
      await selected('rossini');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.querySelector('.swipe-pager-page:not([inert])')?.scrollTop === 0);
    }

    await openPracticeOptions(page);
    assert.equal(await track.evaluate(element => getComputedStyle(element).overflowX), 'hidden', 'Options block horizontal exercise navigation');
    await closePracticeOptions(page);
    await page.waitForFunction(() => !document.querySelector('.swipe-pager')?.hasAttribute('data-blocked'));
    const firstPad = (await page.locator('[data-piano]').first().boundingBox())!;
    await swipe(250, firstPad.y + firstPad.height / 2, firstPad.x + firstPad.width / 2);
    await selected('octaveArpeggio');
    assert.equal(await page.locator('.note-pad.is-held').count(), 0, 'A piano swipe releases its audition');
    await swipe(-250, 720);
    await selected('rossini');
    if (browser.browserType().name() === 'chromium') {
      await swipe(150, 720, 70, 0, true);
      await page.waitForFunction(() => {
        const track = document.querySelector('.swipe-pager')!;
        return Math.abs(track.scrollLeft - track.clientWidth) < 1;
      });
      await selected('rossini');
    }
    await swipe(-250, 720);
    await selected('pentatonic6');
    await swipe(-250, 720);
    await selected('fifthGlide');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(() => {
      const track = document.querySelector('.swipe-pager')!;
      return Math.abs(track.scrollLeft - 3 * track.clientWidth) < 1;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const track = document.querySelector('.swipe-pager')!;
      return Math.abs(track.scrollLeft - 3 * track.clientWidth) < 1;
    });
    await selected('fifthGlide');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dorego.current')!));
    for (const option of ['startingChords', 'repeatTwice', 'repeatTurn', 'repeatHome']) assert.equal(saved[option], true, 'Paging preserves ' + option);
    await page.reload();
    await waitForApp(page, '#play:enabled');
    await selected('fifthGlide');
    assert.equal(await page.locator('#play').getAttribute('data-mode'), 'ready', 'Restoring an exercise never starts playback');
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error(await page.evaluate(() => ({
      pattern: JSON.parse(localStorage.getItem('dorego.current') || '{}').pattern,
      scroll: document.querySelector('.swipe-pager')?.scrollLeft,
      active: document.querySelector('.swipe-pager-page:not([inert])')?.getAttribute('data-page'),
      blocked: document.querySelector('.swipe-pager')?.getAttribute('data-blocked'),
      hit: document.elementFromPoint(320, 720)?.outerHTML.slice(0, 150),
    })));
    await captureFailure(browser, error);
    throw error;
  } finally {
    await page.close();
  }
}
