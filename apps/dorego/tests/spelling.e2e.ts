import {
  waitForServer,
  captureFailure,
  closeBrowser,
  createContext,
} from '../../../scripts/ci/browser-harness.cjs';
import { playUntil, openPracticeOptions, readSpecValue, setSlider } from './ui-helpers';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { launchTestBrowser, browserName } from './browser-harness';
import { DEFAULT_SPEC, generateExercise, secondsAt } from '../src/music';

const vite = createRequire(import.meta.url)
  .resolve('vite/package.json')
  .replace(/package\.json$/, 'bin/vite.js');
const base = 'http://127.0.0.1:4333/DoReGo/';
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
    '4333',
    '--strictPort',
  ],
  { stdio: 'pipe' }
);
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchTestBrowser();
  const context = await createContext(browser, {
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const configure = async (spec: typeof DEFAULT_SPEC) => {
    if (page.url() === 'about:blank') await page.goto(base);
    // This suite tests labels; let audio warm-up finish before navigating again.
    // WebKit can report cancelled old-document sample fetches as access errors.
    await page.waitForFunction(
      () => document.querySelector<HTMLButtonElement>('#play')?.disabled === false
    );
    await page.evaluate((spec) => {
      localStorage.setItem('dorego.current', JSON.stringify(spec));
      localStorage.setItem('dorego.glideShapeVersion', '1');
      // Exercise URLs intentionally override saved preferences. This label test
      // seeds the guest preferences, so reload the bare app route.
      history.replaceState(null, '', '/DoReGo/');
    }, spec);
    await page.reload();
    await page.locator('#exercise-title').waitFor();
    await page.waitForFunction(
      () => document.querySelector<HTMLButtonElement>('#play')?.disabled === false
    );
  };
  const seek = (time: number) => playUntil(page, time);
  const labels = () => page.locator('#stage').innerText();
  const checkNoteGeometry = async () => {
    const geometry = await page.locator('.current .pitch-name').evaluate((el) => {
      return {
        letter: el.querySelector('.pitch-letter')!.getBoundingClientRect().toJSON(),
        accidental: el.querySelector('.pitch-accidental')!.getBoundingClientRect().toJSON(),
        note: el.getBoundingClientRect().toJSON(),
        host: el.parentElement!.getBoundingClientRect().toJSON(),
      };
    });
    const { letter, accidental, note, host } = geometry;
    assert.ok(accidental.height < letter.height * 0.65, 'Accidental is a compact modifier');
    assert.ok(accidental.left >= letter.right, 'Accidental does not overlap the letter');
    assert.ok(accidental.bottom < letter.bottom, 'Accidental is raised');
    assert.ok(Math.abs(note.x + note.width / 2 - host.x - host.width / 2) < 1, 'Note is centered');
    const label = (await page.locator('.current .practice-pitch-label').boundingBox())!;
    assert.ok(label.y + label.height <= note.y, 'Current label stays above the note');
  };

  const spec = {
    ...DEFAULT_SPEC,
    pattern: 'rossini' as const,
    low: 60,
    high: 80,
    key: 4,
    progression: 'up' as const,
    countIn: 0,
    repetitions: 1,
    startingChords: false,
    restBeats: 0,
    bpm: 240,
  };
  await configure(spec);
  assert.match(
    (await page.locator('#stage').getAttribute('aria-label'))!,
    /Next D♭4, range D♭4 to A♭5/
  );
  assert.ok((await labels()).includes('D♭4'));
  assert.equal(await page.locator('#high-spin').inputValue(), 'G♯5');
  const before = [
    await page.locator('#low-spin').inputValue(),
    await page.locator('#high-spin').inputValue(),
  ];
  const exercise = generateExercise(spec);
  await seek(secondsAt(exercise.rounds[1].onsetBeat + 0.25, spec.bpm));
  assert.match(
    (await page.locator('#stage').getAttribute('aria-label'))!,
    /Current practice note D♭4/
  );
  assert.deepEqual(
    [await page.locator('#low-spin').inputValue(), await page.locator('#high-spin').inputValue()],
    before
  );
  await checkNoteGeometry();

  await page.locator('#low-spin').click();
  const grid = page.getByRole('dialog', { name: 'Choose lowest note' });
  await mkdir('work', { recursive: true });
  await grid.screenshot({ path: `work/spelling-${browserName}-picker.png` });
  const flat = grid.getByRole('button', { name: 'C♯4', exact: true });
  assert.match((await flat.textContent())!, /C♯4/);
  assert.equal(await flat.getAttribute('aria-description'), null);
  await flat.click();
  assert.equal(await readSpecValue(page, 'low'), '61');
  assert.equal(await page.locator('#low-spin').inputValue(), 'C♯4');
  await page.setViewportSize({ width: 390, height: 844 });
  await openPracticeOptions(page);
  assert.equal(await page.locator('#low-wheel').getAttribute('aria-valuetext'), 'C♯4');
  assert.equal(
    await page.locator('#low-wheel [data-midi="61"] .note-wheel-primary').textContent(),
    'C♯4'
  );

  assert.equal(await page.locator('.note-wheel-alias, .note-picker-alias').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await configure({ ...spec, low: 54, high: 73 });
    await seek(secondsAt(8.2, spec.bpm)); // Rossini's major seventh, E♯, on the white F key.
    assert.ok(
      (await page.locator('[data-piano="65"]').getAttribute('aria-label')) === 'E♯4',
      'The reference piano must use the round spelling'
    );
    await checkNoteGeometry();
    await mkdir('work', { recursive: true });
    await page.screenshot({
      path: `work/spelling-${browserName}-${mobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
  }
  await configure({ ...spec, pattern: 'major', key: 6, low: 66, high: 78, direction: 'down' });
  await seek(secondsAt(1.2, spec.bpm));
  assert.equal(await page.locator('[data-piano="77"]').getAttribute('aria-label'), 'E♯5');
  await page.setViewportSize({ width: 1280, height: 900 });
  await configure({ ...spec, pattern: 'pentatonic9', low: 60, high: 69, direction: 'up' });
  assert.equal(await readSpecValue(page, 'pattern'), 'pentatonic9');
  assert.equal(await page.locator('[data-pattern="pentatonic6"]').count(), 1);
  assert.equal(
    await page.locator('[data-pattern][aria-current]').textContent(),
    'Pentatonic Threes'
  );
  await openPracticeOptions(page);
  assert.equal(await page.locator('#pentatonic-notes').inputValue(), '9 notes');
  await seek(secondsAt(1.2, spec.bpm));
  await page.screenshot({ path: `work/pentatonic-nine-${browserName}.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: context-aware current/next notes and piano, sharp-only selectors, nine-note pentatonic, mobile labels and descending key spelling.'
  );
  await context.close();
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill('SIGTERM');
}
