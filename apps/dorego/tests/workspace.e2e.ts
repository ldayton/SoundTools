import { verifyMaqamScales } from './maqam.e2e';
import { waitForServer, captureFailure, closeBrowser, createContext } from '../../../scripts/ci/browser-harness.cjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser, browserName } from './browser-harness';
import { DEFAULT_SPEC } from '../src/music';
import { selectExercise, openPracticeOptions, setSlider } from './ui-helpers';
const vite = createRequire(import.meta.url)
  .resolve('vite/package.json')
  .replace(/package.json$/, 'bin/vite.js');
const port = Number(process.env.TEST_PORT || 4348),
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
  await waitForServer(base, { server });
  browser = await launchTestBrowser({ args: browserName === 'chromium' ? ['--mute-audio'] : [] });
  const context = await createContext(browser, {
    viewport: { width: 1680, height: 1050 },
    serviceWorkers: 'block',
  });
  await context.addInitScript(
    (spec) => {
      localStorage.setItem('dorego.current', JSON.stringify(spec));
      localStorage.setItem('dorego.glideShapeVersion', '1');
      (window as any).sources = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
        if (this.buffer && this.buffer.duration > 0.1) {
          const entry = { rate: this.playbackRate.value, ended: false };
          (window as any).sources.push(entry);
          this.addEventListener('ended', () => (entry.ended = true));
        }
        return start.apply(this, args);
      };
    },
    {
      ...DEFAULT_SPEC,
      pattern: 'fiveNote',
      countIn: 0,
      startingChords: false,
      repetitions: 1,
      low: 60,
      high: 69,
    }
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('#play:enabled').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Help', exact: true }).count(), 0);
  await page.locator('#low-spin').click();
  const pitchPicker = page.getByRole('dialog', { name: 'Choose lowest note' });
  assert.equal(await pitchPicker.locator('button[data-value]').count(), 60);
  assert.equal(
    await pitchPicker.locator('button[data-value]').first().getAttribute('data-value'),
    '36'
  );
  assert.equal(
    await pitchPicker.locator('button[data-value]').last().getAttribute('data-value'),
    '95'
  );
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Credits', exact: true }).waitFor();
  assert.equal(await page.locator('#settings-ui a[href*="NOTICE.txt"]').count(), 2);
  await page.getByRole('link', { name: 'DoReGo home', exact: true }).click();
  assert.equal(await page.locator('[data-pattern]').count(), 9);
  assert.equal(await page.getByRole('link', { name: 'Warm-up', exact: true }).count(), 0);
  const header = page.locator('.mantine-AppShell-header');
  const play = page.locator('#play');
  assert.ok(await header.locator('#play').count());
  assert.equal(
    await page.getByRole('slider', { name: 'Playback position', exact: true }).count(),
    0
  );
  assert.match(await header.locator('#elapsed').innerText(), /0:00 \/ \d+:\d+/);
  assert.equal(await page.locator('[role=radio]').count(), 0);
  await page.locator('#direction-down').click();
  assert.equal(await page.locator('#direction-down').getAttribute('aria-pressed'), 'true');
  await page.locator('#direction-up').click();
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '150');
  assert.equal(await page.getByRole('slider', { name: 'Tempo slider', exact: true }).count(), 0);
  assert.match((await page.locator('#exercise-summary').textContent()) ?? '', /Round 1 of 3/);
  await page.locator('#tempo-up').click();
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '155');
  await page.locator('#tempo-down').click();
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '150');
  assert.equal(await page.locator('#previous-round').isDisabled(), true);
  await page.locator('#next-round').click();
  assert.match((await page.locator('#exercise-summary').textContent())!, /Round 2 of 3/);
  assert.equal(await play.getAttribute('data-mode'), 'paused');
  await page.locator('#next-round').click();
  assert.equal(await page.locator('#next-round').isDisabled(), true);
  await page.locator('#previous-round').click();
  await page.locator('#restart').click();
  const before = await play.boundingBox();
  for (const name of [
    'Collapse navigation',
    'Collapse practice options',
    'Open navigation',
    'Expand practice options',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    const after = await play.boundingBox();
    assert.ok(Math.abs(after!.x - before!.x) < 2, `${name} moves transport`);
  }
  assert.ok(
    (await page.locator('.white-key').count()) >= 25,
    'Desktop keyboard uses the available width'
  );
  const key = page.locator('[data-piano="60"]');
  await key.waitFor();
  await page.waitForFunction(() => {
    const key = document.querySelector('[data-piano="60"]');
    return (
      key &&
      Math.round(key.getBoundingClientRect().width) === (innerWidth <= 760 ? 20 : 32) &&
      getComputedStyle(key).backgroundColor === 'rgb(255, 255, 255)'
    );
  });
  assert.equal(await key.locator('.piano-note-label').textContent().then(s => s?.trim()), 'C4');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-piano="60"] .piano-note-label')!).visibility === 'visible');
  const dKey = page.locator('[data-piano="62"]');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-piano="62"] .piano-note-label')!).visibility === 'hidden');
  // Let the sidebar finish moving the keyboard before focusing a key.
  await dKey.click({ trial: true });
  await dKey.focus();
  await page.keyboard.down('Enter');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-piano="62"] .piano-note-label')!).visibility === 'visible');
  await page.keyboard.up('Enter');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-piano="62"] .piano-note-label')!).visibility === 'hidden');
  await key.click();
  await page.waitForFunction(() => (window as any).sources.length > 0);
  assert.equal(
    await play.getAttribute('data-mode'),
    'ready',
    'Reference key must not start exercise'
  );
  await page.waitForFunction(() => (window as any).sources.every((s: any) => s.ended));
  await key.press('Enter');
  await page.waitForFunction(() => (window as any).sources.length > 1);
  await page.waitForFunction(() => (window as any).sources.every((s: any) => s.ended));
  await play.click();
  await page.waitForFunction(
    () => document.querySelector('#play')?.getAttribute('data-mode') === 'playing'
  );
  await page.waitForFunction(() => document.querySelectorAll('.piano-key.is-playing').length > 0);
  await page.locator('#next-round').click();
  await page.waitForFunction(
    () => document.querySelector('#play')?.getAttribute('data-mode') === 'playing'
  );
  assert.match((await page.locator('#exercise-summary').textContent())!, /Round 2 of 3/);
  await page.locator('#previous-round').click();
  await page.waitForFunction(
    () => document.querySelector('#play')?.getAttribute('data-mode') === 'playing'
  );
  await key.click();
  assert.equal(
    await play.getAttribute('data-mode'),
    'playing',
    'Audition must not interrupt exercise'
  );
  await play.click();
  assert.equal(await page.locator('.piano-key.is-playing').count(), 0);
  const pos = await page.locator('#elapsed').getAttribute('data-seconds');
  await page.locator('#bpm').fill('90');
  await page.locator('#bpm').press('Tab');
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '90');
  assert.ok(Number(await page.locator('#elapsed').getAttribute('data-seconds')) >= Number(pos));
  await page.locator('#restart').click();
  assert.equal(await play.getAttribute('data-mode'), 'ready');
  for (const width of [320, 393, 760, 761, 900, 1120, 1680]) {
    await page.setViewportSize({ width, height: width <= 760 ? 852 : 1050 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.piano-octave')].every(
        (e) => e.getBoundingClientRect().width <= e.parentElement!.getBoundingClientRect().width + 1
      )
    );
    await page.waitForFunction(() => {
      const keys = [...document.querySelectorAll('.white-key')];
      return (
        keys.length > 0 && keys.every((key) => {
          const bounds = key.getBoundingClientRect();
          return Math.round(bounds.width) === (innerWidth <= 760 ? 20 : 32) &&
            Math.round(bounds.height) === (innerWidth <= 760 ? 84 : 144);
        }) && [...document.querySelectorAll('.black-key')].every(
          (key) => Math.round(key.getBoundingClientRect().width) === (innerWidth <= 760 ? 14 : 24)
        )
      );
    });
  }
  await page.locator('.piano-key').first().click({ trial: true });
  await page.waitForFunction(() => {
    const key = document.querySelector('.piano-key');
    return key && getComputedStyle(key).userSelect === 'none';
  });
  assert.equal(await page.locator('.piano-key').first().evaluate(key => {
    const event = new MouseEvent('contextmenu', {bubbles:true, cancelable:true});
    key.dispatchEvent(event);
    return event.defaultPrevented;
  }), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await selectExercise(page, 'pentatonic6');
  for (const count of ['6', '9', '12']) {
    await page.locator('#pentatonic-notes').selectOption(count);
    assert.match((await page.locator('#exercise-title').textContent())!, /^Pentatonic Threes \(/);
  }
  await page.getByRole('button', { name: 'Close practice options', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await selectExercise(page, 'rossini');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(
    await page
      .getByRole('button', { name: 'Expand practice options', exact: true })
      .getAttribute('aria-expanded'),
    'false'
  );
  await openPracticeOptions(page);
  assert.equal(await page.locator('.dorego-builder-ui .mantine-Accordion-root').count(), 0);
  await page.getByLabel('Count-in', { exact: true }).waitFor();
  await page.getByLabel('Count-in', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Close practice options', exact: true }).click();
  await page.locator('#play:enabled').waitFor();
  await setSlider(page, 'volume', 0);
  const readyHeight = (await page.locator('#stage').boundingBox())!.height;
  await page.locator('#play').click();
  await page.locator('.practice-count-in').waitFor();
  assert.equal(await page.locator('.practice-status').textContent(), 'Count-in');
  assert.match(await page.locator('.practice-count-in').innerText(), /Bar [12] of 2/);
  assert.ok(
    Math.abs((await page.locator('#stage').boundingBox())!.height - readyHeight) < 1,
    'Count-in retains the readout height'
  );
  await page.locator('#play').click();
  await page.locator('#restart').click();
  assert.equal(await page.locator('.practice-status').textContent(), 'Ready');
  await mkdir('work', { recursive: true });
  await page.screenshot({ path: `work/workspace-${browserName}-mobile.png` });
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.screenshot({ path: `work/workspace-${browserName}-desktop.png` });
  const retina = await createContext(browser, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    serviceWorkers: 'block',
  });
  await retina.addInitScript(
    (spec) => localStorage.setItem('dorego.current', JSON.stringify(spec)),
    { ...DEFAULT_SPEC, countIn: 0, startingChords: false, repetitions: 1, volume: -60 }
  );
  const phone = await retina.newPage();
  await phone.goto(base);
  await phone.locator('#play:enabled').waitFor();
  assert.equal(await phone.locator('#stage canvas').count(), 0);
  assert.equal(await phone.locator('.current .pitch-name').textContent(), 'E3');
  assert.equal(await phone.locator('.next .pitch-name').textContent(), 'F3');
  await phone.locator('#play').click();
  const selected = await phone.locator('.current .pitch-name').evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return { text: selection.toString(), selectable: getComputedStyle(el).userSelect };
  });
  assert.deepEqual(selected, { text: 'E3', selectable: 'text' });
  await phone.waitForFunction(
    () => Number(document.querySelector('#elapsed')?.getAttribute('data-seconds')) > 0.15
  );
  assert.equal(
    await phone.evaluate(() => window.getSelection()?.toString()),
    'E3',
    'Playback updates retain selected note text'
  );
  await phone.locator('#play').click();
  await phone.screenshot({ path: `work/readout-${browserName}-retina.png` });
  await retina.close();
  await verifyMaqamScales(browser, base);
  assert.deepEqual(errors, []);
  console.log(
    `${browserName}: toolbar geometry, nine exercises, mobile drawers, fixed keys, reference audio, playback animation, tempo, elapsed time and responsive widths pass`
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
