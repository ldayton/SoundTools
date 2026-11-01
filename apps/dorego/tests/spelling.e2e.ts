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
  for (let i = 0; i < 70; i++) {
    if (server.exitCode !== null) throw Error('Spelling preview failed to start');
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Capture actual canvas text, covering the same renderer used by video export.
  await page.addInitScript(() => {
    const labels: string[] = [];
    (window as any).spellingLabels = labels;
    const bounds: any[] = [];
    (window as any).spellingBounds = bounds;
    const proto = CanvasRenderingContext2D.prototype;
    const fill = proto.fillRect,
      text = proto.fillText;
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0) {
        labels.length = 0;
        bounds.length = 0;
      }
      return fill.apply(this, args);
    };
    proto.fillText = function (value, ...args) {
      labels.push(value);
      const m = this.measureText(value);
      bounds.push({
        value,
        size: Number(/([\d.]+)px/.exec(this.font)?.[1]),
        left: args[0] - m.actualBoundingBoxLeft,
        right: args[0] + m.actualBoundingBoxRight,
        top: args[1] - m.actualBoundingBoxAscent,
        bottom: args[1] + m.actualBoundingBoxDescent,
      });
      return text.call(this, value, ...args);
    };
  });
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
    }, spec);
    await page.reload();
    await page.locator('#exercise-title').waitFor();
    await page.waitForFunction(
      () => document.querySelector<HTMLButtonElement>('#play')?.disabled === false
    );
  };
  const seek = async (time: number) => {
    await page.locator('#position').evaluate((element, time) => {
      (element as HTMLInputElement).value = String(time);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, time);
  };
  const labels = () => page.evaluate(() => (window as any).spellingLabels as string[]);
  const checkNoteGeometry = async (centerY: number) => {
    const all = await page.evaluate(
      () =>
        (window as any).spellingBounds as {
          value: string;
          size: number;
          left: number;
          right: number;
          top: number;
          bottom: number;
        }[]
    );
    const note = all.filter(
      (b) =>
        b.size >= 35 &&
        b.left < 800 &&
        b.top < 700 &&
        b.bottom > 200 &&
        /^(?:[A-G]|[♭♯]|\d+)$/.test(b.value)
    );
    const letter = note.find((b) => /^[A-G]$/.test(b.value))!;
    const accidental = note.find((b) => /^[♭♯]$/.test(b.value))!;
    assert.ok(letter && accidental, 'Accidentals are drawn as separate modifiers');
    assert.ok(accidental.bottom - accidental.top <= (letter.bottom - letter.top) * 0.68);
    assert.ok(accidental.left > letter.right, 'Accidental does not overlap the letter');
    assert.ok(accidental.bottom < letter.bottom, 'Accidental is raised');
    const left = Math.min(...note.map((b) => b.left)),
      right = Math.max(...note.map((b) => b.right));
    const top = Math.min(...note.map((b) => b.top)),
      bottom = Math.max(...note.map((b) => b.bottom));
    assert.ok(Math.abs((left + right) / 2 - 520) < 1, 'Combined ink stays horizontally centered');
    assert.ok(Math.abs((top + bottom) / 2 - centerY) < 1, 'Combined ink stays vertically centered');
    assert.ok(
      all.find((b) => b.value === 'CURRENT')!.bottom < top,
      'Current label stays above the note'
    );
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
  assert.ok((await labels()).join('').includes('D♭4'));
  assert.equal(await page.locator('#high-spin').inputValue(), 'A♭5');
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
  await checkNoteGeometry(350);

  await page.locator('#low-spin').click();
  const grid = page.getByRole('dialog', { name: 'Choose lowest note' });
  await mkdir('work', { recursive: true });
  await grid.screenshot({ path: `work/spelling-${browserName}-picker.png` });
  const flat = grid.getByRole('button', { name: 'D♭4', exact: true });
  assert.match((await flat.textContent())!, /C♯4/);
  assert.equal(await flat.getAttribute('aria-description'), 'Also C♯4');
  await flat.click();
  assert.equal(await page.locator('#low').inputValue(), '61');
  assert.equal(await page.locator('#low-spin').inputValue(), 'D♭4');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#low-wheel').getAttribute('aria-valuetext'), 'D♭4 / C♯4');
  assert.equal(
    await page.locator('#low-wheel [data-midi="61"] .note-wheel-primary').textContent(),
    'D♭4'
  );

  assert.equal(
    await page.locator('#low-wheel [data-midi="61"] .note-wheel-alias').textContent(),
    'C♯4'
  );
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await configure({ ...spec, low: 54, high: 73 });
    await seek(secondsAt(8.2, spec.bpm)); // Rossini's major seventh, E♯, on the white F key.
    assert.ok(
      (await labels()).join('').includes('E♯4'),
      'The active piano key must use the round spelling'
    );
    await checkNoteGeometry(mobile ? 528 : 350);
    await mkdir('work', { recursive: true });
    await page.screenshot({
      path: `work/spelling-${browserName}-${mobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
  }
  await configure({ ...spec, pattern: 'major', key: 6, low: 66, high: 78, direction: 'down' });
  await seek(secondsAt(1.2, spec.bpm));
  assert.ok((await labels()).join('').includes('E♯5'));
  assert.deepEqual(errors, []);
  console.log(
    'PASS: context-aware current/next notes and piano, stable selectors, aliases, mobile labels and descending key spelling.'
  );
  await context.close();
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
