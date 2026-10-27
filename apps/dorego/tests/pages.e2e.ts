import { createRequire } from 'node:module';
const viteCli = createRequire(import.meta.url)
  .resolve('vite/package.json')
  .replace(/package\.json$/, 'bin/vite.js');
import { launchTestBrowser } from './browser-harness';
import { DEFAULT_SPEC } from '../src/music';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const base = process.env.PAGES_TEST_URL || 'http://127.0.0.1:4318/DoReGo/';
const basePath = new URL(base).pathname;
const server = process.env.PAGES_TEST_URL
  ? null
  : spawn(
      process.execPath,
      [
        viteCli,
        'preview',
        '--mode',
        'pages',
        '--outDir',
        'dist-pages',
        '--host',
        '127.0.0.1',
        '--port',
        '4318',
        '--strictPort',
      ],
      { stdio: 'pipe' }
    );
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* Wait for preview startup. */
    }
    if (server?.exitCode !== null && server) throw new Error('Static preview could not start.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await launchTestBrowser({ headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  const samples: string[] = [];
  const errors: string[] = [];
  await page.exposeFunction('recordRuntimeError', (message: string) => errors.push(message));
  // WebKit's inspector also reports caught, aborted fetches as page errors.
  // Observe actual script exceptions/rejections instead of network diagnostics.
  await page.addInitScript(() => {
    window.addEventListener('error', (event) => (window as any).recordRuntimeError(event.message));
    window.addEventListener('unhandledrejection', (event) =>
      (window as any).recordRuntimeError(String(event.reason))
    );
  });
  page.on('response', (response) => {
    if (response.url().includes('/samples/')) {
      assert.ok(response.ok(), `Sample unavailable: ${response.url()}`);
      samples.push(response.url());
    }
  });
  let releaseSamples!: () => void;
  const sampleGate = new Promise<void>((resolve) => {
    releaseSamples = resolve;
  });
  await page.route('**/samples/bitklavier-web-v1/*.flac', async (route) => {
    await sampleGate;
    await route.continue();
  });
  await page.goto(base);
  await page.locator('#exercise-title').waitFor();
  await page.getByRole('button', { name: 'Loading...' }).waitFor();
  assert.ok(await page.locator('#play').isDisabled());
  assert.equal(await page.locator('#play').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('.piano-warmup i').count(), 3);
  releaseSamples();
  await page.waitForFunction(
    () => !(document.querySelector('#play') as HTMLButtonElement).disabled
  );
  assert.equal(await page.locator('#play').innerText(), 'Play');
  assert.ok(samples.length > 0, 'Piano samples should load before the first click');
  const preparedSamples = samples.length;
  assert.equal(
    await page.locator('#save-preset, #saved-presets, #delete-preset, #save-dialog').count(),
    0
  );
  assert.equal(await page.locator('#gate').count(), 0);
  assert.equal(await page.locator('#noteBeats').count(), 0);
  assert.equal(await page.locator('#solfege').count(), 0);
  assert.equal(await page.locator('#transition').count(), 0);
  assert.deepEqual(await page.locator('#countIn option').allTextContents(), [
    '0 bars',
    '½ bar',
    '1 bar',
    '2 bars',
  ]);
  assert.equal(await page.locator('.brand').getAttribute('href'), basePath);
  assert.equal(
    await page.locator('#video-button, #midi-download, #export-dialog, .export-card').count(),
    0
  );
  assert.equal(await page.locator('#pattern').inputValue(), 'arpeggio');
  assert.equal(await page.locator('#low').inputValue(), '52');
  assert.equal(await page.locator('#high').inputValue(), '76');
  assert.equal(await page.locator('#bpm').inputValue(), '150');
  await page.locator('#low-spin').press('ArrowUp');
  assert.equal(await page.locator('#low').inputValue(), '53');
  await page.locator('#low-spin').press('ArrowDown');
  assert.equal(await page.locator('#low').inputValue(), '52');
  assert.ok(await page.locator('#low-wheel').isHidden());
  assert.equal(await page.locator('#low-spin').getAttribute('readonly'), '');
  await page.locator('#low-spin').click();
  await page
    .getByRole('dialog', { name: 'Choose lowest note' })
    .getByRole('button', { name: 'F♯3', exact: true })
    .click();
  assert.equal(await page.locator('#low').inputValue(), '54');
  await page.locator('#low-choose').click();
  await page
    .getByRole('dialog', { name: 'Choose lowest note' })
    .getByRole('button', { name: 'E3', exact: true })
    .click();
  assert.equal(await page.locator('#low').inputValue(), '52');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () =>
      document.querySelector('#high-wheel')!.getBoundingClientRect().height > 0 &&
      document.querySelector('#high-wheel')!.scrollTop ===
        (Number(document.querySelector<HTMLInputElement>('#high')!.value) - 24) * 32
  );
  await page.locator('#high-wheel').evaluate((el) => {
    el.scrollTop -= 96;
  });
  await page.waitForFunction(
    () => document.querySelector<HTMLInputElement>('#high')!.value === '73'
  );
  await page.locator('#high-wheel').evaluate((el) => {
    el.scrollTop += 96;
  });
  await page.waitForFunction(
    () => document.querySelector<HTMLInputElement>('#high')!.value === '76'
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#play').click();
  // Check readiness directly; headless audio drivers have different startup latency.
  assert.equal(await page.locator('#play').innerText(), 'Pause');
  assert.equal(await page.locator('#play').getAttribute('aria-busy'), 'false');
  await page.waitForFunction(
    () => Number((document.querySelector('#position') as HTMLInputElement).value) > 0.15
  );
  assert.equal(samples.length, preparedSamples, 'Play must use the preloaded samples');
  await page.locator('#play').click();
  assert.ok(samples.length > 0);
  assert.ok(samples.every((url) => url.includes(basePath + 'samples/bitklavier-web-v1/')));
  await page.locator('#how-button').click();
  const credits = page.locator('#how-dialog a[href*="bitklavier"]');
  const creditsPath = await credits.getAttribute('href');
  const notice = await fetch(new URL(creditsPath!, base));
  assert.ok(notice.ok);
  assert.match(await notice.text(), /Creative Commons Attribution 4.0/);
  const celloNoticePath = await page
    .locator('#how-dialog a[href*="vsco-cello"]')
    .getAttribute('href');
  const celloNotice = await fetch(new URL(celloNoticePath!, base));
  assert.ok(celloNotice.ok);
  assert.match(await celloNotice.text(), /CC0/);
  await page.locator('#how-dialog .close-dialog').click();
  await page.locator('#tempo-up').click();
  assert.equal(await page.locator('#bpm').inputValue(), '155');
  await page.locator('#tempo-down').click();
  assert.equal(await page.locator('#bpm').inputValue(), '150');
  await page.locator('.more-settings summary').click();
  await page.locator('#countIn-trigger').click();
  const countField = (await page.locator('#countIn-trigger').boundingBox())!;
  const countMenu = (await page.locator('#countIn-menu').boundingBox())!;
  assert.ok(Math.abs(countField.x - countMenu.x) < 1);
  assert.ok(Math.abs(countField.width - countMenu.width) < 1);
  assert.ok(
    Math.abs(countMenu.y - countField.y - countField.height - 6) < 1 ||
      Math.abs(countField.y - countMenu.y - countMenu.height - 6) < 1
  );
  await page.locator('#countIn-menu').getByRole('option', { name: '1 bar', exact: true }).click();
  assert.equal(await page.locator('#countIn').inputValue(), '4');
  await page.locator('#countIn-trigger').click();
  await page.locator('#countIn-menu').getByRole('option', { name: '2 bars', exact: true }).click();

  await page.getByRole('button', { name: 'Increase repeats', exact: true }).click();
  assert.equal(await page.locator('#repeat-count').inputValue(), '2');
  assert.equal(await page.locator('#repetitions').inputValue(), '3');
  await page.getByRole('button', { name: 'Decrease repeats', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('#repeat-count').isHidden());
  for (const id of ['repeat', 'rest'])
    assert.deepEqual(await page.locator(`#${id}-select option`).allTextContents(), [
      'None',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
  await page.locator('#repeat-select').selectOption('8');
  assert.equal(await page.locator('#repetitions').inputValue(), '9');
  await page.locator('#rest-select').selectOption('8');
  assert.equal(await page.locator('#restBeats').inputValue(), '8');
  await page.locator('#repeat-select').selectOption('0');
  assert.equal(await page.locator('#repetitions').inputValue(), '1');
  await page.locator('#repeat-select').selectOption('1');
  await page.locator('#rest-select').selectOption('0');
  assert.equal(await page.locator('#restBeats').inputValue(), '0');
  await page.locator('#rest-select').selectOption('2');
  await page.locator('#tempo-up').click();
  assert.equal(await page.locator('#bpm').inputValue(), '155');
  await page.locator('#tempo-down').click();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('#pattern').selectOption('rossini');
  assert.equal(await page.locator('#exercise-title').textContent(), 'Rossini Scale');
  assert.ok(await page.locator('#direction').isHidden());
  assert.ok(await page.locator('#form-error').isHidden());
  assert.ok(
    Number(await page.locator('#high').inputValue()) -
      Number(await page.locator('#low').inputValue()) >=
      19
  );
  await page.locator('#pattern').selectOption('arpeggio');
  assert.ok(await page.locator('#direction').isVisible());
  assert.equal(
    await page.locator('#exercise-title').textContent(),
    'Arpeggio & Scale (Rising first)'
  );
  await page.locator('#pattern').selectOption('pentatonic12');
  assert.equal(await page.locator('#exercise-title').textContent(), 'Pentatonic Sequence (Threes) (Rising first)');
  assert.deepEqual(await page.locator('#direction label span').allTextContents(), ['Rising first', 'Falling first']);
  if (await page.locator('.more-settings').getAttribute('open') === null)
    await page.locator('.more-settings > summary').click();
  assert.ok(await page.locator('#note-repeats').isVisible());
  assert.equal(await page.locator('#repeat-home-label').textContent(), 'Home note on return');
  assert.equal(await page.locator('#repeat-turn-label').textContent(), 'Highest note');
  await page.getByRole('switch', { name: 'Home note on return', exact: true }).check();
  await page.getByRole('switch', { name: 'Highest note', exact: true }).check();
  await page.locator('input[name="direction"][value="down"]').check();
  assert.equal(await page.locator('#repeat-turn-label').textContent(), 'Lowest note');
  assert.ok(await page.getByRole('switch', { name: 'Lowest note', exact: true }).isChecked());
  await page.locator('#repeatTurn').uncheck();
  await page.locator('#repeatHome').uncheck();
  await page.locator('.more-settings > summary').click();

  await page.locator('input[name="direction"][value="down"]').check();
  assert.equal(await page.locator('#exercise-title').textContent(), 'Pentatonic Sequence (Threes) (Falling first)');
  await page.locator('input[name="direction"][value="up"]').check();
  for (const [pattern, label] of [
    ['fiveNote', 'Five-Note Scale'],
    ['octaveArpeggio', 'Octave Arpeggio'],
  ]) {
    await page.locator('#pattern').selectOption(pattern);
    assert.equal(await page.locator('#exercise-title').textContent(), `${label} (Rising first)`);
    assert.ok(await page.locator('#direction').isVisible());
    assert.ok(await page.locator('#key').isDisabled());
    await page.locator('input[name="direction"][value="down"]').check();
    assert.equal(await page.locator('#exercise-title').textContent(), `${label} (Falling first)`);
    await page.locator('input[name="progression"][value="both"]').check();
    assert.equal(await page.locator('input[name="direction"]:checked').inputValue(), 'down');
    await page.locator('input[name="direction"][value="up"]').check();
    await page.locator('input[name="progression"][value="up"]').check();
  }
  await page.reload();
  assert.equal(await page.locator('#pattern').inputValue(), 'octaveArpeggio');
  assert.deepEqual(await page.locator('#pattern option').allTextContents(), [
    'Arpeggio & Scale',
    'Octave Arpeggio',
    'Rossini Scale',
    'Five-Note Scale',
    'Pentatonic Sequence (Threes)',
    'Major Scale',
    'Fifth Glide',
    'Octave Glide',
  ]);
  for (const pattern of ['fifthGlide', 'octaveGlide']) {
    await page.locator('#pattern').selectOption(pattern);
    assert.ok(await page.locator('#direction').isVisible());
    assert.equal(await page.locator('#starting-chords-field').getAttribute('hidden'), null);
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('#play')?.disabled);
    await page.locator('input[name="direction"][value="down"]').check();
    assert.match((await page.locator('#exercise-title').textContent()) ?? '', /\(Down\)/);
    await page.locator('input[name="direction"][value="up"]').check();
    assert.match((await page.locator('#exercise-title').textContent()) ?? '', /\(Up\)/);
    await page.locator('input[name="direction"][value="both"]').check();
    assert.match((await page.locator('#exercise-title').textContent()) ?? '', /Up & back/);
    await page.locator('input[name="direction"][value="up"]').check();
    assert.ok(await page.locator('#form-error').isHidden());
  }
  assert.ok(samples.some((url) => url.includes(basePath + 'samples/vsco-cello/')));
  await page.locator('input[name="progression"][value="down"]').check();
  await page.locator('#high-spin').press('Enter');
  await page
    .getByRole('dialog', { name: 'Choose highest note' })
    .getByRole('button', { name: 'E4', exact: true })
    .click();
  assert.ok(
    await page.locator('#progression').isHidden(),
    'One-key octave range hides progression'
  );
  await page.locator('#high-spin').press('Enter');
  await page
    .getByRole('dialog', { name: 'Choose highest note' })
    .getByRole('button', { name: 'F4', exact: true })
    .click();
  assert.ok(await page.locator('#progression').isVisible());
  assert.ok(await page.locator('input[name="progression"][value="down"]').isChecked());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#high-wheel').press('ArrowDown');
  assert.ok(await page.locator('#progression').isHidden());
  await page.locator('#high-wheel').press('ArrowUp');
  assert.ok(await page.locator('#progression').isVisible());
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('#pattern').selectOption('major');
  assert.ok(await page.locator('#note-range').isHidden());
  assert.ok(await page.locator('#range-heading').isHidden());
  assert.ok(await page.locator('#key').isVisible());
  for (const direction of ['up', 'down']) {
    await page.locator(`input[name="direction"][value="${direction}"]`).check();
    await page.locator('#key').selectOption('62');
    assert.equal(await page.locator('#low').inputValue(), direction === 'up' ? '62' : '50');
    assert.equal(await page.locator('#high').inputValue(), direction === 'up' ? '74' : '62');
  }
  await page.reload();
  assert.equal(await page.locator('#key').inputValue(), '62');
  assert.ok(await page.locator('#note-range').isHidden());
  await page.locator('#pattern').selectOption('arpeggio');
  assert.ok(await page.locator('#note-range').isVisible());
  await page.locator('input[name="direction"][value="up"]').check();
  await page.locator('input[name="progression"][value="both"]').check();
  await page.reload();
  assert.equal(await page.locator('input[name="direction"]:checked').count(), 1);
  assert.equal(await page.locator('input[name="progression"]:checked').inputValue(), 'both');
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('dorego.current')!).progression),
    'both'
  );
  await page.locator('input[name="direction"][value="up"]').click();
  assert.ok(await page.locator('input[name="direction"][value="up"]').isChecked());
  // A phone gets a taller, fully fitted keyboard; desktop keeps the video layout.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#stage') as HTMLCanvasElement;
    return canvas.width === canvas.height;
  });
  const mobile = await page.locator('#stage').boundingBox();
  assert.ok(mobile && Math.abs(mobile.width - mobile.height) < 2);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#stage') as HTMLCanvasElement;
    return canvas.width === 1600 && canvas.height === 900;
  });
  const preferencesPage = await browser.newPage();
  const remembered = {
    ...DEFAULT_SPEC,
    pattern: 'fiveNote',
    low: 48,
    high: 67,
    bpm: 156,
    direction: 'down',
    countIn: 4,
    volume: -12,
    restBeats: 4,
    repetitions: 3,
    metronome: true,
    startingChords: false,
  };
  await preferencesPage.addInitScript((spec) => {
    if (!localStorage.getItem('dorego.current'))
      localStorage.setItem('dorego.current', JSON.stringify(spec));
  }, remembered);
  await preferencesPage.goto(base);
  for (const [id, value] of Object.entries(remembered)) {
    const field = preferencesPage.locator(`#${id}`);
    if ((await field.count()) && typeof value !== 'boolean' && !['key', 'direction'].includes(id))
      assert.equal(await field.inputValue(), String(value), `Stored ${id} was overwritten`);
  }
  assert.ok(await preferencesPage.locator('input[name="direction"][value="down"]').isChecked());
  assert.equal(await preferencesPage.locator('#metronome').count(), 0);
  assert.ok(!(await preferencesPage.locator('#startingChords').isChecked()));
  await preferencesPage.locator('#bpm').fill('194');
  await preferencesPage.locator('#bpm').press('Tab');
  assert.equal(
    await preferencesPage.evaluate(
      () => JSON.parse(localStorage.getItem('dorego.current')!).metronome
    ),
    false
  );

  await preferencesPage.reload();
  assert.equal(await preferencesPage.locator('#bpm').inputValue(), '194');
  assert.equal(await preferencesPage.locator('#pattern').inputValue(), 'fiveNote');
  assert.equal(await preferencesPage.locator('#low').inputValue(), '48');
  assert.equal(await preferencesPage.locator('#high').inputValue(), '67');
  await preferencesPage.close();
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${base} loads with working piano samples, playback, credits, defaults, and no export UI.`
  );
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
