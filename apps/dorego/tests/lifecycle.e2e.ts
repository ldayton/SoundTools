import { createRequire } from 'node:module';
const viteCli = createRequire(import.meta.url).resolve('vite/package.json').replace(/package\.json$/, 'bin/vite.js');
import { launchTestBrowser } from './browser-harness';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC } from '../src/music';

// Controlled browser faults exercise real player/UI paths without production hooks.
const base = 'http://127.0.0.1:4323';
const server = spawn(
  process.execPath,
  [viteCli, '--host', '127.0.0.1', '--port', '4323', '--strictPort'],
  { stdio: 'pipe' }
);
const browser = await launchTestBrowser();
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* Wait for dev server. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    (spec) => {
      localStorage.setItem('dorego.current', JSON.stringify(spec));
      const probe = ((window as any).lifecycleProbe = {
        context: null as AudioContext | null,
        delayResume: false,
        rejectOld: null as null | ((error: Error) => void),
        blockFrames: false,
      });
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(options?: AudioContextOptions) {
          super(options);
          if (options?.latencyHint !== 'playback') return;
          probe.context = this;
          const resume = this.resume.bind(this);
          this.resume = () => {
            if (!probe.delayResume) return resume();
            probe.delayResume = false;
            return new Promise<void>((_resolve, reject) => {
              probe.rejectOld = reject;
            });
          };
        }
      };
      const frame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => (probe.blockFrames ? 0 : frame(callback));
    },
    { ...DEFAULT_SPEC, pattern: 'major', countIn: 0, bpm: 150, repetitions: 4 }
  );
  await page.goto(base);
  await page.waitForFunction(
    () => document.querySelector<HTMLButtonElement>('#play')?.disabled === false
  );
  const play = page.locator('#play');
  const label = () => play.innerText();
  const position = () => page.locator('#position').inputValue().then(Number);
  await play.click();
  await page.waitForFunction(
    () => Number(document.querySelector<HTMLInputElement>('#position')!.value) > 0.05
  );
  await page.evaluate(() => (window as any).lifecycleProbe.context.suspend());
  await page.waitForFunction(() => document.querySelector('#play')?.textContent === 'Resume');
  const paused = await position();
  assert.ok(paused > 0);
  await page.evaluate(() => (window as any).lifecycleProbe.context.resume());
  await page.waitForTimeout(150);
  assert.equal(await label(), 'Resume', 'OS recovery must not unexpectedly restart audio');
  assert.equal(await position(), paused);
  await play.click();
  await page.waitForTimeout(300);
  assert.equal(await label(), 'Pause');
  await page.waitForFunction(
    (previous) =>
      Number(document.querySelector<HTMLInputElement>('#position')!.value) > previous + 0.03,
    paused,
    { timeout: 5000 }
  );

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  assert.equal(await label(), 'Pause', 'Visibility alone must not pause healthy audio');
  await page.evaluate(() => {
    delete (document as any).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await label(), 'Pause');
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await label(), 'Pause');

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  assert.equal(await label(), 'Resume');
  const restored = await position();
  await play.click();
  await page.waitForTimeout(200);
  assert.ok((await position()) >= restored);
  await page.evaluate(() => document.dispatchEvent(new Event('freeze')));
  assert.equal(await label(), 'Resume');
  await page.evaluate(() => document.dispatchEvent(new Event('resume')));
  assert.equal(await label(), 'Resume');

  await page.locator('#restart').click();
  await page.evaluate(() => {
    (window as any).lifecycleProbe.delayResume = true;
  });
  await play.click();
  await page.waitForFunction(() => !!(window as any).lifecycleProbe.rejectOld);
  await page.locator('#restart').click();
  await play.click();
  await page.waitForTimeout(200);
  await page.evaluate(() =>
    (window as any).lifecycleProbe.rejectOld(new Error('obsolete startup failure'))
  );
  await page.waitForTimeout(150);
  assert.equal(await label(), 'Pause', 'Old rejection must not pause the newer session');
  assert.ok(!(await page.locator('body').innerText()).includes('obsolete startup failure'));

  await page.evaluate(`(() => {
    const context = window.lifecycleProbe.context;
    const frozen = context.currentTime;
    Object.defineProperty(context, 'currentTime', { configurable: true, get: () => frozen });
  })()`);
  await page.waitForFunction(() => document.querySelector('#play')?.textContent === 'Resume');
  await page.evaluate(() => {
    delete (window as any).lifecycleProbe.context.currentTime;
  });
  await play.click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const end = performance.now() + 1900;
    while (performance.now() < end) {}
  });
  await page.waitForFunction(() => document.querySelector('#play')?.textContent === 'Resume');

  await play.click();
  await page.evaluate(() => (window as any).lifecycleProbe.context.close());
  await page.waitForFunction(() => document.querySelector('#play')?.textContent === 'Resume');
  await play.click();
  await page.waitForTimeout(200);
  assert.equal(await label(), 'Pause', 'A closed audio context must be recreated on Resume');

  await page.locator('#restart').click();
  for (let i = 0; i < 10; i++) {
    await play.click();
    await play.click();
  }
  assert.equal(await label(), 'Resume');
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector<HTMLButtonElement>('#play')?.disabled === false
  );
  assert.equal(await label(), 'Play');
  await page.locator('#bpm').fill('240');
  // Move near completion, then prevent all future animation callbacks.
  const end = await page.locator('#position').getAttribute('max');
  await page.locator('#position').fill(String(Number(end) - 0.5));
  await page.evaluate(() => {
    (window as any).lifecycleProbe.blockFrames = true;
  });
  await play.click();
  await page.waitForFunction(
    () => document.querySelector('#play')?.textContent === 'Replay',
    undefined,
    { polling: 100, timeout: 5000 }
  );
  assert.equal(await position(), Number(end));
  assert.deepEqual(errors, []);
  console.log(
    'PASS: interruption/resume, persisted page restoration, freeze/resume, stale startup rejection, closed-context recovery, frozen running clock, missed scheduling coverage, rapid toggles, and completion without animation frames.'
  );
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
