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
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await launchTestBrowser({ args: browserName === 'chromium' ? ['--mute-audio'] : [] });
  const context = await browser.newContext({
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
  assert.equal(await page.locator('[data-pattern]').count(), 8);
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
  assert.equal(Math.round((await key.boundingBox())!.width), 32);
  assert.equal(
    await key.evaluate((e) => getComputedStyle(e).backgroundColor),
    'rgb(255, 255, 255)'
  );
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
  for (const width of [320, 390, 760, 900, 1120, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.piano-octave')].every(
        (e) => e.getBoundingClientRect().width <= e.parentElement!.getBoundingClientRect().width + 1
      )
    );
    await page.waitForFunction(() => {
      const keys = [...document.querySelectorAll('.white-key')];
      return (
        keys.length > 0 && keys.every((key) => Math.round(key.getBoundingClientRect().width) === 32)
      );
    });
  }
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
  await page.getByLabel('Count-in', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Close practice options', exact: true }).click();
  await page.locator('#play:enabled').waitFor();
  await setSlider(page, 'volume', 0);
  await mkdir('work', { recursive: true });
  await page.screenshot({ path: `work/workspace-${browserName}-mobile.png` });
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.screenshot({ path: `work/workspace-${browserName}-desktop.png` });
  assert.deepEqual(errors, []);
  console.log(
    `${browserName}: toolbar geometry, eight exercises, mobile drawers, fixed keys, reference audio, playback animation, tempo, elapsed time and six widths pass`
  );
} finally {
  await browser?.close();
  server.kill();
}
