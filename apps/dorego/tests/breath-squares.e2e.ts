import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser, browserName } from './browser-harness';
import { openPracticeOptions, selectExercise, openSettings, openPractice } from './ui-helpers';
const vite = createRequire(import.meta.url)
  .resolve('vite/package.json')
  .replace(/package.json$/, 'bin/vite.js');
const port = Number(process.env.TEST_PORT || 4359),
  base = `http://127.0.0.1:${port}/DoReGo/`;
const server = spawn(
  process.execPath,
  [
    vite,
    'preview',
    '--mode',
    'pages',
    '--outDir',
    'dist-pages',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { stdio: 'ignore' }
);
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await launchTestBrowser({ args: browserName === 'chromium' ? ['--mute-audio'] : [] });
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1050 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    if (!localStorage.getItem('dorego.exercise')) {
      localStorage.setItem('dorego.exercise', 'breathSquares');
      localStorage.setItem('dorego.breathSquares', JSON.stringify({ rounds: 2, seconds: 2 }));
    }
  });
  // This suite drives visual time. Real device-clock cadence and signal are
  // exercised separately by breath-audio.e2e.ts without a virtual clock.
  await page.addInitScript({
    content: `(() => {
    const descriptor = Object.getOwnPropertyDescriptor(AudioContext.prototype, 'currentTime');
    window.restoreAudioClock = function () {
      if (descriptor) Object.defineProperty(AudioContext.prototype, 'currentTime', descriptor);
      else delete AudioContext.prototype.currentTime;
    };
    Object.defineProperty(AudioContext.prototype, 'currentTime', {
      configurable: true,
      get: function () { return performance.now() / 1000; }
    });
  })();`,
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto(base);
  await page.locator('#breath-squares').waitFor();
  assert.equal(await page.locator('[data-pattern][aria-current]').count(), 1);
  assert.equal(await page.locator('.breath-cell').count(), 4);
  assert.equal(
    await page
      .locator('.breath-cell')
      .allTextContents()
      .then((values) => values.join('')),
    ''
  );
  assert.equal(await page.locator('#bpm').count(), 0);
  await page.locator('#breath-play').click();
  await page.locator('#breath-play[data-mode="playing"]').waitFor();
  const active = page.locator('.breath-cell[data-active]');
  assert.equal(await active.getAttribute('data-phase'), '0');
  assert.match((await active.textContent()) || '', /Inhale/);
  const small = await active.locator('.breath-orb').getAttribute('style');
  await page.clock.runFor(1100);
  await page.waitForFunction(
    () => document.querySelector('.breath-cell[data-active] output')?.textContent === '1'
  );
  assert.equal(await active.locator('output').textContent(), '1');
  assert.notEqual(await active.locator('.breath-orb').getAttribute('style'), small);
  await page.locator('#breath-play').click();
  await page.clock.runFor(10000);
  assert.equal(await active.getAttribute('data-phase'), '0');
  await page.locator('#breath-play').click();
  await page.locator('#breath-play[data-mode="playing"]').waitFor();
  await page.clock.runFor(1100);
  await page.locator('.breath-cell[data-active][data-phase="1"]').waitFor();
  assert.equal(await active.getAttribute('data-phase'), '1');
  assert.equal(await active.locator('.breath-orb').count(), 0);
  await page.clock.runFor(2000);
  await page.locator('.breath-cell[data-active][data-phase="2"]').waitFor();
  assert.equal(await active.getAttribute('data-phase'), '2');
  assert.equal(await active.locator('.breath-orb').count(), 1);
  await page.clock.runFor(2000);
  await page.locator('.breath-cell[data-active][data-phase="3"]').waitFor();
  assert.equal(await active.getAttribute('data-phase'), '3');
  await page.clock.runFor(2000);
  await page.locator('.breath-cell[data-active][data-phase="0"]').waitFor();
  assert.equal(await active.getAttribute('data-phase'), '0');
  assert.match((await page.locator('#breath-squares').textContent()) || '', /Round 2 of 2/);
  await page.clock.runFor(8000);
  await active.waitFor({ state: 'hidden' });
  assert.equal(await active.count(), 0);
  assert.match((await page.locator('.breath-status').textContent()) || '', /Complete/);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.locator('#breath-play[data-mode="playing"]').waitFor();
  await openSettings(page);
  await page.clock.runFor(5000);
  await openPractice(page);
  assert.match((await page.locator('.breath-status').textContent()) || '', /Paused/);
  await page.locator('#breath-restart').click();
  await page.locator('#exercise-title').focus();
  await page.keyboard.press('Space');
  await page.locator('#breath-play[data-mode="playing"]').waitFor();
  await page.clock.runFor(1000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(5000);
  assert.match((await page.locator('.breath-status').textContent()) || '', /Paused/);
  await page.evaluate(() => {
    delete (document as any).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.match((await page.locator('.breath-status').textContent()) || '', /Paused/);
  await openPracticeOptions(page);
  await page.locator('#breath-rounds').fill('3');
  await page.locator('#breath-rounds').press('Tab');
  await page.locator('#breath-seconds').fill('4');
  await page.locator('#breath-seconds').press('Tab');
  await page.reload();
  await page.locator('#breath-squares').waitFor();
  assert.equal(await page.locator('#breath-rounds').inputValue(), '3');
  assert.equal(await page.locator('#breath-seconds').inputValue(), '4');
  await page.locator('#breath-play').click();
  await page.locator('#breath-play[data-mode="playing"]').waitFor();
  await page.clock.runFor(1000);
  await mkdir('work/breath-squares', { recursive: true });
  await page.screenshot({
    path: `work/breath-squares/${browserName}-desktop.png`,
    animations: 'disabled',
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.runFor(300);
    await page.waitForFunction(
      () => document.querySelector('.workspace-content')!.getBoundingClientRect().left <= 20
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const cells = await page.locator('.breath-cell').evaluateAll((cells) =>
      cells.map((cell) => {
        const r = cell.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      })
    );
    assert.ok(cells.every((cell) => Math.abs(cell.w - cell.h) <= 1));
    assert.ok(cells[0].x < cells[1].x && cells[1].y < cells[2].y && cells[3].x < cells[2].x);
    await page.screenshot({
      path: `work/breath-squares/${browserName}-${width}.png`,
      animations: 'disabled',
    });
  }
  await page.evaluate(() => (window as any).restoreAudioClock());
  await selectExercise(page, 'fiveNote');
  await page.locator('#play:enabled').waitFor();
  assert.equal(await page.locator('#breath-squares').count(), 0);
  await selectExercise(page, 'breathSquares');
  assert.match((await page.locator('.breath-status').textContent()) || '', /Paused/);
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${browserName}: countdown, clockwise phases, inhale/exhale animation, pause/resume, completion/replay, settings, persistence, mobile geometry and switching exercises`
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
