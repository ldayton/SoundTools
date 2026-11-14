import { volumePercent } from '@ldayton/ui/volume';
import {
  readSpecValue,
  openMoreOptions,
  openPracticeOptions,
  sliderValue,
  setSlider,
} from './ui-helpers';
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
  assert.equal(await page.locator('#play .mantine-Loader-root').count(), 1);
  releaseSamples();
  await page.waitForFunction(
    () => !(document.querySelector('#play') as HTMLButtonElement).disabled
  );
  assert.equal(await page.locator('#play').innerText(), 'Play');
  assert.ok(
    (await page.locator('#play').boundingBox())!.x <
      (await page.locator('#restart').boundingBox())!.x,
    'Primary playback action precedes restart'
  );
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
    'None',
    '½ bar',
    '1 bar',
    '2 bars',
  ]);
  assert.equal(
    await page.getByRole('link', { name: 'DoReGo home', exact: true }).getAttribute('href'),
    basePath
  );
  assert.equal(
    await page.locator('#video-button, #midi-download, #export-dialog, .export-card').count(),
    0
  );
  assert.equal(await page.locator('#pattern').inputValue(), 'arpeggio');
  assert.equal(await readSpecValue(page, 'low'), '52');
  assert.equal(await readSpecValue(page, 'high'), '76');
  assert.equal(await page.locator('#bpm').inputValue(), '150');
  const tempoField = (await page.locator('#bpm').boundingBox())!;
  assert.ok(
    tempoField.width >= 70 && tempoField.width <= 220,
    'Tempo entry stays compact and readable'
  );
  for (const name of ['Playback position', 'Tempo slider', 'Volume'])
    assert.equal(await page.getByRole('slider', { name, exact: true }).count(), 1);
  await page.locator('#bpm').fill('151');
  await page.locator('#bpm').press('Enter');
  await page.locator('#tempo-up').click();
  assert.equal(
    await page.locator('#bpm').inputValue(),
    '156',
    'Tempo steps preserve integer offsets'
  );
  await page.locator('#tempo-down').click();
  assert.equal(await page.locator('#bpm').inputValue(), '151');
  await page.locator('#bpm').fill('150');
  await page.locator('#bpm').press('Enter');
  await page.locator('#low-spin').press('ArrowUp');
  assert.equal(await readSpecValue(page, 'low'), '53');
  await page.locator('#low-spin').press('ArrowDown');
  assert.equal(await readSpecValue(page, 'low'), '52');
  assert.ok(await page.locator('#low-wheel').isHidden());
  assert.equal(await page.locator('#low-spin').getAttribute('readonly'), '');
  await page.locator('#low-spin').click();
  await page
    .getByRole('dialog', { name: 'Choose lowest note' })
    .getByRole('button', { name: 'F♯3', exact: true })
    .click();
  assert.equal(await readSpecValue(page, 'low'), '54');
  await page.locator('#low-spin').click();
  await page
    .getByRole('dialog', { name: 'Choose lowest note' })
    .getByRole('button', { name: 'E3', exact: true })
    .click();
  assert.equal(await readSpecValue(page, 'low'), '52');
  await page.locator('#low-spin').press('Enter');
  const picker = page.getByRole('dialog', { name: 'Choose lowest note' });
  await picker.getByRole('button', { name: 'E3', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'E3');
  await picker.getByRole('button', { name: 'E3', exact: true }).press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'F3');
  await picker.getByRole('button', { name: 'F3', exact: true }).press('Escape');
  assert.ok(await picker.isHidden());
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'low-spin');
  assert.equal(await readSpecValue(page, 'low'), '52', 'Focus movement does not commit a pitch');
  await page.locator('#low-spin').click();
  await page.locator('#page-title').click();
  assert.ok(await picker.isHidden(), 'Outside click dismisses pitch grid');
  await page.locator('#low-spin').click();
  await page.locator('#low-spin').press('Escape');
  await picker.waitFor({ state: 'hidden' });
  assert.ok(await picker.isHidden(), 'Escape also closes the grid when focus is on its trigger');
  await page.locator('#low-spin').click();
  await page.setViewportSize({ width: 1000, height: 850 });
  await picker.waitFor({ state: 'hidden' });
  assert.ok(await picker.isHidden(), 'Resize dismisses the desktop grid');
  await page.setViewportSize({ width: 390, height: 844 });
  await openPracticeOptions(page);
  await page.waitForFunction(
    () =>
      document.querySelector('#high-wheel')!.getBoundingClientRect().height > 0 &&
      document.querySelector('#high-wheel')!.scrollTop ===
        (Number(document.querySelector('#high-wheel')!.getAttribute('aria-valuenow')) - 24) * 32
  );
  await page.locator('#high-wheel').evaluate((el) => {
    el.scrollTop -= 96;
  });
  await page.waitForFunction(
    () => document.querySelector('#high-wheel')!.getAttribute('aria-valuenow') === '73'
  );
  await page.locator('#high-wheel').evaluate((el) => {
    el.scrollTop += 96;
  });
  await page.waitForFunction(
    () => document.querySelector('#high-wheel')!.getAttribute('aria-valuenow') === '76'
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#play').click();
  // Check readiness directly; headless audio drivers have different startup latency.
  assert.equal(await page.locator('#play').innerText(), 'Pause');
  assert.equal(await page.locator('#play').getAttribute('aria-busy'), 'false');
  await page.waitForFunction(
    () => Number(document.querySelector('#position')!.getAttribute('aria-valuenow')) > 0.15
  );
  assert.equal(samples.length, preparedSamples, 'Play must use the preloaded samples');
  await page.locator('#play').click();
  assert.ok(samples.length > 0);
  assert.ok(samples.every((url) => url.includes(basePath + 'samples/bitklavier-web-v1/')));
  await page.locator('#how-button').click();
  const credits = page.getByRole('dialog').locator('a[href*="bitklavier"]');
  const creditsPath = await credits.getAttribute('href');
  const notice = await fetch(new URL(creditsPath!, base));
  assert.ok(notice.ok);
  assert.match(await notice.text(), /Creative Commons Attribution 4.0/);
  const celloNoticePath = await page
    .getByRole('dialog')
    .locator('a[href*="vsco-cello"]')
    .getAttribute('href');
  const celloNotice = await fetch(new URL(celloNoticePath!, base));
  assert.ok(celloNotice.ok);
  assert.match(await celloNotice.text(), /CC0/);
  await page.getByRole('button', { name: 'Close how it works', exact: true }).click();
  await page.locator('#tempo-up').click();
  assert.equal(await page.locator('#bpm').inputValue(), '155');
  await page.locator('#tempo-down').click();
  assert.equal(await page.locator('#bpm').inputValue(), '150');
  await openMoreOptions(page);
  await page.locator('#countIn').selectOption('4');
  assert.equal(await page.locator('#countIn').inputValue(), '4');
  await page.locator('#countIn').selectOption('8');

  await page.locator('#repeat-count').press('ArrowUp');
  assert.equal(await page.locator('#repeat-count').inputValue(), '2');
  assert.equal(await readSpecValue(page, 'repetitions'), '3');
  await page.locator('#repeat-count').press('ArrowDown');
  await page.setViewportSize({ width: 390, height: 844 });
  await openPracticeOptions(page);
  assert.ok(await page.locator('#repeat-count').isHidden());
  await page.locator('#low-spin-label').click();
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'low-wheel',
    'Mobile label focuses visible wheel'
  );
  const mobileLow = Number(await readSpecValue(page, 'low'));
  await page.locator('#low-wheel').press('ArrowUp');
  assert.equal(Number(await readSpecValue(page, 'low')), mobileLow + 1);
  await page.locator('#low-wheel').press('ArrowDown');
  assert.equal(Number(await readSpecValue(page, 'low')), mobileLow);

  for (const [id, max] of [
    ['repeat', 15],
    ['rest', 16],
  ] as const)
    assert.deepEqual(
      await page.locator(`#${id}-select option`).allTextContents(),
      Array.from({ length: max + 1 }, (_, i) => (i ? String(i) : 'None'))
    );
  await page.locator('#repeat-select').selectOption('15');
  assert.equal(await readSpecValue(page, 'repetitions'), '16');
  await page.locator('#rest-select').selectOption('16');
  assert.equal(await readSpecValue(page, 'restBeats'), '16');
  await page.locator('#repeat-select').selectOption('8');
  assert.equal(await readSpecValue(page, 'repetitions'), '9');
  await page.locator('#rest-select').selectOption('8');
  assert.equal(await readSpecValue(page, 'restBeats'), '8');
  await page.locator('#repeat-select').selectOption('0');
  assert.equal(await readSpecValue(page, 'repetitions'), '1');
  await page.locator('#repeat-select').selectOption('1');
  await page.locator('#rest-select').selectOption('0');
  assert.equal(await readSpecValue(page, 'restBeats'), '0');
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
    Number(await readSpecValue(page, 'high')) - Number(await readSpecValue(page, 'low')) >= 19
  );
  await page.locator('#pattern').selectOption('arpeggio');
  assert.ok(await page.locator('#direction').isVisible());
  assert.equal(
    await page.locator('#exercise-title').textContent(),
    'Arpeggio & Scale (Rising first)'
  );
  await openMoreOptions(page);
  assert.ok(
    await page.locator('#note-repeats').isVisible(),
    'Arpeggio & Scale exposes note repeats'
  );
  await page.getByRole('checkbox', { name: 'Highest note', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Home note on return', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Repeat each round twice', exact: true }).check();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('dorego.current') || '{}').repeatTwice === true
  );
  await page.reload();
  await page.locator('#pattern').waitFor();
  await openMoreOptions(page);
  assert.ok(await page.locator('#repeatTwice').isChecked(), 'breath practice survives reload');
  assert.ok(await page.locator('#repeatTurn').isChecked());
  assert.ok(await page.locator('#repeatHome').isChecked());
  await page.locator('#repeatTwice').uncheck();
  await page.locator('#repeatTurn').uncheck();
  await page.locator('#repeatHome').uncheck();
  await page.locator('#pattern').selectOption('pentatonic12');
  assert.equal(
    await page.locator('#exercise-title').textContent(),
    'Pentatonic Threes (12 notes) (Rising first)'
  );
  assert.deepEqual(await page.locator('#direction [role=radio]').allTextContents(), [
    'Rising first',
    'Falling first',
  ]);
  await openMoreOptions(page);
  assert.ok(await page.locator('#note-repeats').isVisible());
  assert.equal(await page.locator('label[for=repeatHome]').textContent(), 'Home note on return');
  assert.equal(await page.locator('label[for=repeatTurn]').textContent(), 'Highest note');
  await page.getByRole('checkbox', { name: 'Home note on return', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Highest note', exact: true }).check();
  await page.locator('#direction-down').click();
  assert.equal(await page.locator('label[for=repeatTurn]').textContent(), 'Lowest note');
  assert.ok(await page.getByRole('checkbox', { name: 'Lowest note', exact: true }).isChecked());
  await page.locator('#repeatTurn').uncheck();
  await page.locator('#repeatHome').uncheck();
  await page.getByRole('button', { name: 'More options', exact: true }).click();

  await page.locator('#direction-down').click();
  assert.equal(
    await page.locator('#exercise-title').textContent(),
    'Pentatonic Threes (12 notes) (Falling first)'
  );
  await page.locator('#direction-up').click();
  for (const [pattern, label] of [
    ['fiveNote', 'Five-Note Scale'],
    ['octaveArpeggio', 'Octave Arpeggio'],
  ]) {
    await page.locator('#pattern').selectOption(pattern);
    assert.equal(await page.locator('#exercise-title').textContent(), `${label} (Rising first)`);
    assert.ok(await page.locator('#direction').isVisible());
    assert.ok(await page.locator('#key').isDisabled());
    await page.locator('#direction-down').click();
    assert.equal(await page.locator('#exercise-title').textContent(), `${label} (Falling first)`);
    await page.locator('#progression-both').click();
    assert.equal(await readSpecValue(page, 'direction'), 'down');
    await page.locator('#direction-up').click();
    await page.locator('#progression-up').click();
  }
  await page.reload();
  assert.equal(await page.locator('#pattern').inputValue(), 'octaveArpeggio');
  assert.deepEqual(await page.locator('#pattern option').allTextContents(), [
    'Arpeggio & Scale',
    'Octave Arpeggio',
    'Rossini Scale',
    'Five-Note Scale',
    'Pentatonic Threes (9 notes)',
    'Pentatonic Threes (12 notes)',
    'Major Scale',
    'Fifth Glide',
    'Octave Glide',
  ]);
  await openMoreOptions(page);
  for (const pattern of ['fifthGlide', 'octaveGlide']) {
    await page.locator('#pattern').selectOption(pattern);
    assert.ok(await page.locator('#direction').isVisible());
    assert.ok(await page.locator('#startingChords').isVisible());
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('#play')?.disabled);
    await page.locator('#direction-down').click();
    assert.match((await page.locator('#exercise-title').textContent()) ?? '', /\(Down\)/);
    await page.locator('#direction-up').click();
    assert.match((await page.locator('#exercise-title').textContent()) ?? '', /\(Up\)/);
    await page.locator('#direction-both').click();
    assert.match((await page.locator('#exercise-title').textContent()) ?? '', /Up & back/);
    await page.locator('#direction-up').click();
    assert.ok(await page.locator('#form-error').isHidden());
  }
  assert.ok(samples.some((url) => url.includes(basePath + 'samples/vsco-cello/')));
  await page.locator('#progression-down').click();
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
  assert.ok(await page.locator('#progression-down').isChecked());
  await page.setViewportSize({ width: 390, height: 844 });
  await openPracticeOptions(page);
  await page.locator('#high-wheel').press('ArrowDown');
  assert.ok(await page.locator('#progression').isHidden());
  await page.locator('#high-wheel').press('ArrowUp');
  await page.locator('#progression').waitFor({ state: 'visible' });
  assert.ok(await page.locator('#progression').isVisible());
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('#pattern').selectOption('major');
  assert.ok(await page.locator('#note-range').isHidden());
  assert.ok(await page.locator('#range-heading').isHidden());
  assert.ok(await page.locator('#key').isVisible());
  for (const direction of ['up', 'down']) {
    await page.locator(`#direction-${direction}`).click();
    await page.locator('#key').selectOption('62');
    assert.equal(await readSpecValue(page, 'low'), direction === 'up' ? '62' : '50');
    assert.equal(await readSpecValue(page, 'high'), direction === 'up' ? '74' : '62');
  }
  await page.reload();
  assert.equal(await page.locator('#key').inputValue(), '62');
  assert.ok(await page.locator('#note-range').isHidden());
  await page.locator('#pattern').selectOption('arpeggio');
  assert.ok(await page.locator('#note-range').isVisible());
  await page.locator('#direction-up').click();
  await page.locator('#progression-both').click();
  await page.reload();
  assert.equal(await page.locator('#direction [role=radio][aria-checked=true]').count(), 1);
  assert.equal(await readSpecValue(page, 'progression'), 'both');
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('dorego.current')!).progression),
    'both'
  );
  await page.locator('#direction-up').click();
  assert.ok(await page.locator('#direction-up').isChecked());
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
  // Impossible range choices are disabled; the other endpoint and saved exercise stay put.
  await page.locator('#pattern').selectOption('fiveNote');
  const validSaved = await page.evaluate(() => localStorage.getItem('dorego.current'));
  const highBefore = await readSpecValue(page, 'high');
  await page.locator('#low-spin').click();
  const unavailable = page
    .getByRole('dialog', { name: 'Choose lowest note' })
    .getByRole('button', { name: 'C7', exact: true });
  assert.ok(await unavailable.isDisabled());
  await page.keyboard.press('Escape');
  await page.locator('#low-spin').press('End');
  assert.equal(Number(await readSpecValue(page, 'low')), Number(highBefore) - 7);
  assert.equal(await readSpecValue(page, 'high'), highBefore);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('#play')?.disabled);

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
      assert.equal(
        ['volume', 'position', 'tempo-slider'].includes(id)
          ? String(await sliderValue(preferencesPage, id))
          : await field.inputValue(),
        String(id === 'volume' ? volumePercent(Number(value)) : value),
        `Stored ${id} was overwritten`
      );
  }
  assert.ok(await preferencesPage.locator('#direction-down').isChecked());
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
  assert.equal(await readSpecValue(preferencesPage, 'low'), '48');
  assert.equal(await readSpecValue(preferencesPage, 'high'), '67');
  await preferencesPage.close();
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${base} loads with working piano samples, playback, credits, defaults, and no export UI.`
  );
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
