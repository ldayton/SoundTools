import {
  waitForServer,
  captureFailure,
  closeBrowser,
  newPage,
} from '../../../scripts/ci/browser-harness.cjs';
import { selectExercise } from './ui-helpers';
import { volumePercent } from '@ldayton/ui/volume';
import {
  readSpecValue,
  openMoreOptions,
  openPracticeOptions,
  closePracticeOptions,
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
  await waitForServer(base, { server });
  browser = await launchTestBrowser({ headless: true });
  const page = await newPage(browser, { acceptDownloads: true });
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
  await page.getByRole('button', { name: 'Loading audio' }).waitFor();
  assert.ok(await page.locator('#play').isDisabled());
  assert.equal(await page.locator('#play').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('#play .mantine-Loader-root').count(), 1);
  releaseSamples();
  await page.waitForFunction(
    () => !(document.querySelector('#play') as HTMLButtonElement).disabled
  );
  assert.equal(await page.locator('#play').innerText(), 'Play');
  assert.ok(
    (await page.locator('#restart').boundingBox())!.x <
      (await page.locator('#play').boundingBox())!.x,
    'Go to start precedes play, matching the shared transport'
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
  assert.equal(await readSpecValue(page, 'pattern'), 'arpeggio');
  assert.equal(await readSpecValue(page, 'low'), '52');
  assert.equal(await readSpecValue(page, 'high'), '77');
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '150');
  const tempoField = (await page.locator('#bpm').boundingBox())!;
  assert.ok(
    tempoField.width >= 70 && tempoField.width <= 220,
    'Tempo entry stays compact and readable'
  );
  assert.equal(
    await page.getByRole('slider', { name: 'Playback position', exact: true }).count(),
    0
  );
  assert.equal(await page.getByRole('button', { name: 'Volume', exact: true }).count(), 1);
  await page.locator('#bpm').fill('151');
  await page.locator('#bpm').press('Enter');
  await page.locator('#bpm').press('ArrowUp');
  await page.locator('#bpm').press('Tab');
  assert.equal(
    await page.locator('#bpm').getAttribute('aria-valuenow'),
    '156',
    'Tempo steps preserve integer offsets'
  );
  await page.locator('#bpm').press('ArrowDown');
  await page.locator('#bpm').press('Tab');
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '151');
  await page.locator('#bpm').fill('150');
  await page.locator('#bpm').press('Enter');
  await page.locator('#low-spin').press('ArrowUp');
  assert.equal(await readSpecValue(page, 'low'), '53');
  await page.locator('#low-spin').press('ArrowDown');
  assert.equal(await readSpecValue(page, 'low'), '52');
  assert.equal(await page.locator('#low-wheel, #high-wheel').count(), 0);
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
  await page.locator('.note-instrument').click({ position: { x: 4, y: 4 } });
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
  await closePracticeOptions(page);
  await page.locator('#high-spin').click();
  const mobileHighPicker = page.getByRole('dialog', { name: 'Choose highest note' });
  await mobileHighPicker.getByRole('button', { name: 'D5', exact: true }).click();
  assert.equal(await readSpecValue(page, 'high'), '74');
  await page.locator('#high-spin').click();
  await mobileHighPicker.getByRole('button', { name: 'F5', exact: true }).click();
  assert.equal(await readSpecValue(page, 'high'), '77');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#play').click();
  // Check readiness directly; headless audio drivers have different startup latency.
  assert.equal(await page.locator('#play').innerText(), 'Pause');
  assert.equal(await page.locator('#play').getAttribute('aria-busy'), 'false');
  await page.waitForFunction(
    () => Number(document.querySelector('#elapsed')!.getAttribute('data-seconds')) > 0.15
  );
  assert.equal(samples.length, preparedSamples, 'Play must use the preloaded samples');
  await page.locator('#play').click();
  assert.ok(samples.length > 0);
  assert.ok(samples.every((url) => url.includes(basePath + 'samples/bitklavier-web-v1/')));
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const credits = page.locator('#settings-ui a[href*="bitklavier"]');
  const creditsPath = await credits.getAttribute('href');
  const notice = await fetch(new URL(creditsPath!, base));
  assert.ok(notice.ok);
  assert.match(await notice.text(), /Creative Commons Attribution 4.0/);
  const celloNoticePath = await page
    .locator('#settings-ui a[href*="vsco-cello"]')
    .getAttribute('href');
  const celloNotice = await fetch(new URL(celloNoticePath!, base));
  assert.ok(celloNotice.ok);
  assert.match(await celloNotice.text(), /CC0/);
  await page.getByRole('link', { name: 'DoReGo home', exact: true }).click();
  // Navigation focuses the title on the next frame. Wait for that handoff
  // before focusing the tempo input, so it cannot steal the ArrowUp event.
  await page.waitForFunction(() => document.activeElement?.id === 'exercise-title');
  await page.locator('#bpm').press('ArrowUp');
  await page.locator('#bpm').press('Tab');
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '155');
  await page.locator('#bpm').press('ArrowDown');
  await page.locator('#bpm').press('Tab');
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '150');
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
  await closePracticeOptions(page);
  await page.locator('#low-spin-label').click();
  await picker.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-value')), await readSpecValue(page, 'low'), 'Mobile label opens the note chooser at the selected pitch');
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'low-spin');
  const mobileLow = Number(await readSpecValue(page, 'low'));
  await page.locator('#low-spin').press('ArrowUp');
  assert.equal(Number(await readSpecValue(page, 'low')), mobileLow + 1);
  await page.locator('#low-spin').press('ArrowDown');
  assert.equal(Number(await readSpecValue(page, 'low')), mobileLow);

  await openPracticeOptions(page);
  for (const [id, max, key] of [
    ['repeat', 15, 'repetitions'], ['rest', 16, 'restBeats'], ['countIn', 8, 'countIn'],
  ] as const) {
    const input = page.locator(`#${id}-mobile`);
    await input.fill('0');
    await input.press('Enter');
    assert.ok(await page.locator(`#${id}-mobile-down`).isDisabled());
    await page.locator(`#${id}-mobile-up`).click();
    assert.equal(await readSpecValue(page, key), id === 'repeat' ? '2' : '1');
    await input.fill(String(max));
    await input.press('Enter');
    assert.ok(await page.locator(`#${id}-mobile-up`).isDisabled());
    await page.locator(`#${id}-mobile-down`).click();
    assert.equal(await readSpecValue(page, key), String(id === 'repeat' ? max : max - 1));
    await input.fill(id === 'repeat' ? '1' : id === 'rest' ? '2' : '8');
    await input.press('Enter');
  }
  await page.locator('#bpm').press('ArrowUp');
  await page.locator('#bpm').press('Tab');
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '155');
  await page.locator('#bpm').press('ArrowDown');
  await page.locator('#bpm').press('Tab');
  await page.setViewportSize({ width: 1280, height: 900 });

  await selectExercise(page, 'rossini');
  assert.equal(await page.locator('#exercise-title').textContent(), 'Rossini Scale');
  assert.ok(await page.locator('#direction').isHidden());
  assert.ok(await page.locator('#form-error').isHidden());
  assert.ok(
    Number(await readSpecValue(page, 'high')) - Number(await readSpecValue(page, 'low')) >= 19
  );
  await selectExercise(page, 'arpeggio');
  assert.ok(await page.locator('#direction').isVisible());
  assert.equal(
    await page.locator('#exercise-title').textContent(),
    'Arpeggio & Scale (Rising first)'
  );
  await openMoreOptions(page);
  assert.ok(await page.locator('#note-repeats').isHidden(), 'Arpeggio & Scale omits note repeats');
  assert.ok(await page.locator('#repeatTwice').isHidden(), 'Arpeggio & Scale omits doubled rounds');
  await selectExercise(page, 'octaveArpeggio');
  await openMoreOptions(page);
  assert.ok(await page.locator('#note-repeats').isVisible());
  assert.ok(await page.locator('#repeatTwice').isVisible());
  // Disabled counts reserve their real space on desktop and touch layouts.
  for (const width of [1280, 393]) {
    await page.setViewportSize({ width, height: 900 });
    await openMoreOptions(page);
    if (width === 393) await page.locator('#repeatHomeCount-up').waitFor();
    const geometry = () => page.locator('#note-repeats').evaluate((section) => {
      const box = section.getBoundingClientRect();
      return { height: box.height, fields: ['repeatTurnCount', 'repeatHomeCount'].map((id) => {
        const field = section.querySelector(`#${id}`)!.getBoundingClientRect();
        return [field.x - box.x, field.y - box.y, field.width, field.height];
      }) };
    });
    const before = await geometry();
    for (const id of ['repeatTurn', 'repeatHome']) {
      const checkbox = page.locator(`#${id}`), count = page.locator(`#${id}Count`);
      assert.ok(await count.isVisible(), 'Unchecked repeat count stays visible');
      assert.ok(await count.isDisabled());
      const value = await count.inputValue();
      await checkbox.check();
      assert.ok(await count.isEnabled());
      assert.deepEqual(await geometry(), before, 'Enabling repeats must not move the controls');
      await checkbox.uncheck();
      assert.ok(await count.isDisabled());
      assert.equal(await count.inputValue(), value, 'Disabling repeats retains the count');
      if (width === 393) {
        assert.ok(await page.locator(`#${id}Count-up`).isDisabled());
        assert.ok(await page.locator(`#${id}Count-down`).isDisabled());
      }
      assert.deepEqual(await geometry(), before, 'Disabling repeats must not move the controls');
    }
    await page.screenshot({ path: `/tmp/dorego-repeat-controls-${width}.png`, fullPage: true });
    if (width === 393) {
      await page.locator('#repeatTurn').check();
      await page.locator('#repeatTurnCount-up').click();
      await page.locator('#repeatTurnCount-up').click();
      await page.mouse.move(0, 0);
      await page.locator('#practice-timing-options').screenshot({path:'/tmp/dorego-mobile-sections.png'});
      await page.locator('#repeatTurnCount-down').click();
      await page.locator('#repeatTurnCount-down').click();
      await page.locator('#repeatTurn').uncheck();
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await openMoreOptions(page);
  await page.getByRole('checkbox', { name: 'Repeat highest note', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Repeat home note', exact: true }).check();
  assert.equal(await page.locator('#repeatTurnCount').inputValue(), '4');
  await page.locator('#repeatTurnCount').fill('8');
  await page.locator('#repeatTurnCount').press('Enter');
  await page.locator('#repeatHomeCount').fill('2');
  await page.locator('#repeatHomeCount').press('Enter');
  await page.getByRole('checkbox', { name: 'Repeat each round twice', exact: true }).check();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('dorego.current') || '{}').repeatTwice === true
  );
  await page.reload();
  await page.locator('[data-pattern][aria-current]').waitFor();
  await openMoreOptions(page);
  assert.ok(await page.locator('#repeatTwice').isChecked(), 'breath practice survives reload');
  assert.ok(await page.locator('#repeatTurn').isChecked());
  assert.ok(await page.locator('#repeatHome').isChecked());
  assert.equal(await page.locator('#repeatTurnCount').inputValue(), '8');
  assert.equal(await page.locator('#repeatHomeCount').inputValue(), '2');
  await page.locator('#repeatTurnCount').fill('4');
  await page.locator('#repeatTurnCount').press('Enter');
  await page.locator('#repeatHomeCount').fill('4');
  await page.locator('#repeatHomeCount').press('Enter');
  await page.locator('#repeatTwice').uncheck();
  await page.locator('#repeatTurn').uncheck();
  await page.locator('#repeatHome').uncheck();
  await selectExercise(page, 'pentatonic12');
  assert.equal(await page.locator('#exercise-title').textContent(), 'Pentatonic Threes');
  assert.deepEqual(await page.locator('#direction button[aria-pressed]').allTextContents(), [
    'Rising first',
    'Falling first',
  ]);
  await openMoreOptions(page);
  assert.ok(await page.locator('#note-repeats').isVisible());
  assert.equal(await page.locator('label[for=repeatHome]').textContent(), 'Repeat home note');
  assert.equal(await page.locator('label[for=repeatTurn]').textContent(), 'Repeat highest note');
  await page.getByRole('checkbox', { name: 'Repeat home note', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Repeat highest note', exact: true }).check();
  await page.locator('#direction-down').click();
  assert.equal(await page.locator('label[for=repeatTurn]').textContent(), 'Repeat lowest note');
  assert.ok(await page.getByRole('checkbox', { name: 'Repeat lowest note', exact: true }).isChecked());
  await page.locator('#repeatTurn').uncheck();
  await page.locator('#repeatHome').uncheck();

  await page.locator('#direction-down').click();
  assert.equal(await page.locator('#exercise-title').textContent(), 'Pentatonic Threes');
  await page.locator('#direction-up').click();
  for (const [pattern, label] of [
    ['fiveNote', 'Major Scale'],
    ['octaveArpeggio', 'Octave Arpeggio'],
  ]) {
    await selectExercise(page, pattern);
    // Entering Major Scale normalizes to one octave. Deliberately give the
    // subsequent vocal exercise several roots before testing Between rounds.
    await page.locator('#high-spin').press('Enter');
    await page
      .getByRole('dialog', { name: 'Choose highest note' })
      .getByRole('button', { name: 'G5', exact: true })
      .click();
    assert.equal(
      await page.locator('#exercise-title').textContent(),
      pattern === 'fiveNote' ? label : `${label} (Rising first)`
    );
    assert.equal(await readSpecValue(page, 'direction'), 'up');
    assert.ok(await page.locator('#direction').isVisible());
    assert.ok(await page.locator('#key').isDisabled());
    await page.locator('#direction-down').click();
    assert.equal(
      await page.locator('#exercise-title').textContent(),
      pattern === 'fiveNote' ? label : `${label} (Falling first)`
    );
    assert.equal(await readSpecValue(page, 'direction'), 'down');
    await page.locator('#progression-both').click();
    assert.equal(await readSpecValue(page, 'direction'), 'down');
    await page.locator('#direction-up').click();
    await page.locator('#progression-up').click();
  }
  await page.reload();
  await page.locator('[data-pattern="octaveArpeggio"]').waitFor();
  assert.equal(await readSpecValue(page, 'pattern'), 'octaveArpeggio');
  assert.deepEqual(await page.locator('[data-pattern]').allTextContents(), [
    'Arpeggio & Scale',
    'Octave Arpeggio',
    'Rossini Scale',
    'Pentatonic Threes',
    'Major Scale',
    'Glides',
    'Maqamat',
    'Yemenite ✡︎',
    'Breath Squares',
  ]);
  await openMoreOptions(page);
  for (const pattern of ['fifthGlide', 'octaveGlide']) {
    await selectExercise(page, pattern);
    assert.ok(await page.locator('#direction').isVisible());
    assert.ok(await page.locator('#startingChords').isVisible());
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('#play')?.disabled);
    await page.locator('#direction-down').click();
    assert.equal(await page.locator('#exercise-title').textContent(), 'Glides');
    assert.equal(await readSpecValue(page, 'direction'), 'down');
    await page.locator('#direction-up').click();
    assert.equal(await page.locator('#exercise-title').textContent(), 'Glides');
    assert.equal(await readSpecValue(page, 'direction'), 'up');
    await page.locator('#direction-both').click();
    assert.equal(await page.locator('#exercise-title').textContent(), 'Glides');
    assert.equal(await readSpecValue(page, 'direction'), 'both');
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
  assert.ok(
    await page
      .locator('#progression-down')
      .getAttribute('aria-pressed')
      .then((value) => value === 'true')
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await openPracticeOptions(page);
  await closePracticeOptions(page);
  await page.locator('#high-spin').press('ArrowDown');
  await openPracticeOptions(page);
  assert.ok(await page.locator('#progression').isHidden());
  await closePracticeOptions(page);
  await page.locator('#high-spin').press('ArrowUp');
  await openPracticeOptions(page);
  await page.locator('#progression').waitFor({ state: 'visible' });
  assert.ok(await page.locator('#progression').isVisible());
  await page.setViewportSize({ width: 1280, height: 900 });

  await selectExercise(page, 'major');
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
  await selectExercise(page, 'arpeggio');
  assert.ok(await page.locator('#note-range').isVisible());
  await page.locator('#direction-up').click();
  await page.locator('#progression-both').click();
  await page.reload();
  await page.locator('#direction-up').waitFor();
  assert.equal(await page.locator('#direction button[aria-pressed=true]').count(), 1);
  assert.equal(await readSpecValue(page, 'progression'), 'both');
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('dorego.current')!).progression),
    'both'
  );
  await page.locator('#direction-up').click();
  assert.ok(
    await page
      .locator('#direction-up')
      .getAttribute('aria-pressed')
      .then((value) => value === 'true')
  );
  // Live pitches are selectable native text on both screen sizes; video keeps its canvas.
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#stage .current .pitch-name').waitFor();
    assert.equal(await page.locator('#stage canvas').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  // Impossible range choices are disabled; the other endpoint and saved exercise stay put.
  await selectExercise(page, 'fiveNote');
  const validSaved = await page.evaluate(() => localStorage.getItem('dorego.current'));
  const highBefore = await readSpecValue(page, 'high');
  await page.locator('#low-spin').click();
  const extendedRange = page.getByRole('dialog', { name: 'Choose lowest note' }).getByRole('button', { name: 'Extended range', exact: true });
  if (await extendedRange.getAttribute('aria-pressed') !== 'true') await extendedRange.click();
  const unavailable = page
    .getByRole('dialog', { name: 'Choose lowest note' })
    .getByRole('button', { name: 'B6', exact: true });
  assert.ok(await unavailable.isDisabled());
  await page.keyboard.press('Escape');
  await page.locator('#low-spin').press('End');
  assert.equal(Number(await readSpecValue(page, 'low')), Number(highBefore) - 7);
  assert.equal(await readSpecValue(page, 'high'), highBefore);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector<HTMLButtonElement>('#play')?.disabled === false
  );

  const preferencesPage = await newPage(browser);
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
        id === 'volume'
          ? String(await sliderValue(preferencesPage, id))
          : id === 'bpm'
            ? await field.getAttribute('aria-valuenow')
            : await field.inputValue(),
        String(id === 'volume' ? volumePercent(Number(value)) : value),
        `Stored ${id} was overwritten`
      );
  }
  assert.ok(
    await preferencesPage
      .locator('#direction-down')
      .getAttribute('aria-pressed')
      .then((value) => value === 'true')
  );
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
  assert.equal(await preferencesPage.locator('#bpm').getAttribute('aria-valuenow'), '194');
  assert.equal(await readSpecValue(preferencesPage, 'pattern'), 'fiveNote');
  assert.equal(await readSpecValue(preferencesPage, 'low'), '48');
  assert.equal(await readSpecValue(preferencesPage, 'high'), '67');
  await preferencesPage.close();
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${base} loads with working piano samples, playback, credits, defaults, and no export UI.`
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server?.kill('SIGTERM');
}
