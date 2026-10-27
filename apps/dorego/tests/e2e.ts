import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { Midi } from '../src/midi';
import { DEFAULT_SPEC as APP_DEFAULT_SPEC } from '../src/music';
const DEFAULT_SPEC = {
  ...APP_DEFAULT_SPEC,
  pattern: 'arpeggio' as const,
  key: 0,
  low: 60,
  high: 72,
  bpm: 200,
};

const base = process.env.TEST_URL || 'http://127.0.0.1:4317';
const work = new URL('../work/', import.meta.url);
await mkdir(work, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  acceptDownloads: true,
});
async function setNote(id: string, target: number) {
  const spin = page.locator(`#${id}-spin`);
  let value = Number(await page.locator(`#${id}`).inputValue());
  while (value !== target) {
    await spin.press(value < target ? 'ArrowUp' : 'ArrowDown');
    value = Number(await page.locator(`#${id}`).inputValue());
  }
}
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(base);
  await page.locator('#exercise-title').waitFor();
  assert.equal(await page.locator('#voice').count(), 0);
  assert.equal(
    await page.locator('#exercise-title').textContent(),
    'Arpeggio & Scale (Rising first)'
  );
  assert.equal(await page.locator('#bpm').inputValue(), '150');
  assert.equal(await page.locator('#low').inputValue(), '52');
  assert.equal(await page.locator('#high').inputValue(), '76');
  assert.equal(
    await page.locator('#midi-download, #video-button, #export-dialog, .export-card').count(),
    0
  );
  await page.locator('#pattern').selectOption('arpeggio');
  await setNote('low', 60);
  await setNote('high', 72);

  assert.equal(
    await page.locator('#exercise-title').textContent(),
    'Arpeggio & Scale (Rising first)'
  );
  assert.deepEqual(await page.locator('#pattern option').allTextContents(), [
    'Arpeggio & Scale',
    'Octave Arpeggio',
    'Rossini Scale',
    'Five-Note Scale',
    '12-Note Pentatonic Scale',
    'Major Scale',
    'Fifth Glide',
    'Octave Glide',
  ]);
  assert.deepEqual(await page.locator('#direction label span').allTextContents(), [
    'Rising first',
    'Falling first',
  ]);
  await page.locator('canvas').screenshot({ path: new URL('practice-canvas.png', work).pathname });
  await page.screenshot({ path: new URL('desktop.png', work).pathname, fullPage: true });
  await page.locator('#play').click();
  await page.waitForFunction(
    () => Number((document.querySelector('#position') as HTMLInputElement).value) > 0.15
  );
  assert.equal(await page.locator('#play').innerText(), 'Pause');
  await page.locator('#play').click();
  const paused = Number(await page.locator('#position').inputValue());
  assert.ok(paused > 0.1);
  await page.waitForTimeout(200);
  assert.equal(Number(await page.locator('#position').inputValue()), paused);
  await page.locator('#play').click();
  await page.waitForTimeout(250);
  await page.locator('#play').click();
  assert.ok(Number(await page.locator('#position').inputValue()) > paused);
  await page.locator('#restart').click();
  assert.equal(Number(await page.locator('#position').inputValue()), 0);
  await page.locator('#position').focus();
  await page.keyboard.press('ArrowRight');
  assert.ok(Number(await page.locator('#position').inputValue()) > 0);
  await page.locator('#exercise-title').click();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#play').innerText(), 'Pause');
  await page.locator('#play').click();
  await page.locator('#exercise-title').click();
  await page.keyboard.press('f');
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.locator('#transpose-up').click();
  assert.equal(await page.locator('#low').inputValue(), '61');
  assert.equal(await page.locator('#low').inputValue(), '61');
  await page.locator('#pattern').selectOption('major');
  assert.equal(await page.locator('#pattern').inputValue(), 'major');
  assert.equal(
    await page.locator('#save-preset, #saved-presets, #delete-preset, #save-dialog').count(),
    0
  );
  await page.reload();
  assert.equal(await page.locator('#pattern').inputValue(), 'major');
  const currentSpec = await page.evaluate(() => localStorage.getItem('dorego.current')!);
  const specFile = new URL('cli-exercise.json', work).pathname;
  await writeFile(specFile, currentSpec);
  await promisify(execFile)(process.execPath, [
    '--import',
    'tsx',
    'scripts/export.ts',
    'midi',
    '--spec',
    specFile,
    '--output',
    new URL('exercise.mid', work).pathname,
  ]);
  const midi = new Midi(await readFile(new URL('exercise.mid', work)));
  assert.ok(midi.tracks[0].notes.length > 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true
  );
  await page.screenshot({ path: new URL('mobile.png', work).pathname, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator('#pattern').selectOption('arpeggio');
  await setNote('low', 84);
  assert.ok(await page.locator('#form-error').isVisible());
  assert.ok(await page.locator('#play').isDisabled());
  await setNote('low', 60);
  assert.ok(await page.locator('#form-error').isHidden());
  // Frame-order independence, including a personal transition marker.
  const render = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await render.goto(`${base}/render.html`);
  await render.waitForFunction(() => !!window.doregoRenderer);
  await render.evaluate((spec) => window.doregoRenderer.init(spec, 1280, 720), {
    ...DEFAULT_SPEC,
    transition: 65,
  });
  await render.evaluate(() => window.doregoRenderer.frame(3));
  const first = await render.locator('canvas').screenshot();
  await render.evaluate(() => window.doregoRenderer.frame(12));
  await render.evaluate(() => window.doregoRenderer.frame(0.3));
  await render.evaluate(() => window.doregoRenderer.frame(3));
  assert.deepEqual(await render.locator('canvas').screenshot(), first);
  // The supported piano decodes and renders a non-silent audio track.
  for (const voice of ['bitklavier'] as const) {
    await render.evaluate((spec) => window.doregoRenderer.init(spec, 1280, 720), {
      ...DEFAULT_SPEC,
      pattern: 'major' as const,
      low: 60,
      high: 60,
      countIn: 0,
      repetitions: 1,
      restBeats: 0,
      voice,
    });
    const wav = Buffer.from(await render.evaluate(() => window.doregoRenderer.audio()), 'base64');
    let energy = 0;
    for (let offset = 44; offset < wav.length; offset += 2) energy += wav.readInt16LE(offset) ** 2;
    assert.ok(Math.sqrt(energy / ((wav.length - 44) / 2)) > 100, `${voice} audio is silent`);
  }
  // A longer exercise must extend a previously cropped cached piano sample.
  await render.evaluate((spec) => window.doregoRenderer.init(spec, 1280, 720), {
    ...DEFAULT_SPEC,
    pattern: 'major' as const,
    voice: 'bitklavier' as const,
    low: 60,
    high: 60,
    bpm: 60,
    noteBeats: 4,
    gate: 1,
    countIn: 0,
    repetitions: 1,
    restBeats: 0,
  });
  const sustained = Buffer.from(
    await render.evaluate(() => window.doregoRenderer.audio()),
    'base64'
  );
  let sustainedEnergy = 0,
    sustainedCount = 0;
  for (let offset = 44 + 2 * 44100 * 4; offset < 44 + 3 * 44100 * 4; offset += 2) {
    sustainedEnergy += sustained.readInt16LE(offset) ** 2;
    sustainedCount++;
  }
  assert.ok(
    Math.sqrt(sustainedEnergy / sustainedCount) > 5,
    'Longer notes lost their cached sample tail'
  );

  await render.close();
  // Arpeggio has independent direction and range controls.
  await setNote('low', 60);
  await setNote('high', 67);
  await page.locator('#pattern').selectOption('arpeggio');
  assert.equal(
    await page.locator('#exercise-title').textContent(),
    'Arpeggio & Scale (Rising first)'
  );
  assert.ok(await page.locator('#low').isEnabled());
  assert.ok(await page.locator('#high').isEnabled());
  const narrowSummary = await page.locator('#exercise-summary').textContent();
  await setNote('high', 68);
  assert.notEqual(await page.locator('#exercise-summary').textContent(), narrowSummary);
  await page.locator('.more-settings summary').click();
  const withChords = await page.locator('#exercise-summary').textContent();
  await page.locator('#startingChords').uncheck();
  assert.notEqual(await page.locator('#exercise-summary').textContent(), withChords);
  await page.getByRole('radio', { name: 'Falling first', exact: true }).check();
  assert.equal(
    await page.locator('#exercise-title').textContent(),
    'Arpeggio & Scale (Falling first)'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1440, height: 1100 });
  // A short export through the same UI used by a person.
  const short = {
    ...DEFAULT_SPEC,
    voice: 'bitklavier' as const,
    pattern: 'major',
    low: 60,
    high: 72,
    direction: 'up',
    bpm: 240,
    countIn: 2,
    repetitions: 2,
    restBeats: 1,
    noteBeats: 1,
  };
  await page.evaluate(
    (spec) => localStorage.setItem('dorego.current', JSON.stringify(spec)),
    short
  );
  await page.reload();
  const shortSpec = new URL('cli-short.json', work).pathname;
  await writeFile(shortSpec, JSON.stringify(short));
  const path = new URL('exercise.mp4', work).pathname;
  await promisify(execFile)(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/export.ts',
      'video',
      '--spec',
      shortSpec,
      '--output',
      path,
      '--url',
      base,
    ],
    { timeout: 180000 }
  );
  const { stdout } = await promisify(execFile)('ffprobe', [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    path,
  ]);
  const probe = JSON.parse(stdout);
  assert.ok(probe.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'));
  const stream = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  assert.equal(stream.width, 1280);
  assert.equal(stream.height, 720);
  assert.equal(stream.r_frame_rate, '30/1');
  assert.ok(Number(probe.format.duration) >= 3.05);
  await writeFile(new URL('ffprobe.json', work), stdout);
  const { stdout: pcm } = await promisify(execFile)(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vn', '-f', 'f32le', '-ar', '44100', '-ac', '1', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }
  );
  let square = 0;
  for (let i = 0; i + 4 <= pcm.length; i += 4) square += pcm.readFloatLE(i) ** 2;
  const rms = Math.sqrt(square / (pcm.length / 4));
  assert.ok(rms > 0.001, `Audio should be audible, RMS=${rms}`);
  // Check that guide pitches occur on their shared timeline after the count-in.
  function powerAt(frequency: number, start: number) {
    const length = 4096,
      offset = Math.floor(start * 44100);
    let real = 0,
      imaginary = 0;
    for (let i = 0; i < length; i++) {
      const sample =
        pcm.readFloatLE((offset + i) * 4) *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1)));
      const angle = (2 * Math.PI * frequency * i) / 44100;
      real += sample * Math.cos(angle);
      imaginary += sample * Math.sin(angle);
    }
    return real * real + imaginary * imaginary;
  }
  for (const [time, midi] of [
    [0.55, 60],
    [0.8, 62],
    [1.05, 64],
    [1.55, 60],
  ] as const) {
    const expected = 440 * 2 ** ((midi - 69) / 12),
      power = powerAt(expected, time);
    assert.ok(power > 1, `Expected guide pitch ${midi} at ${time}s`);
    for (const other of [60, 62, 64].filter((n) => n !== midi))
      assert.ok(
        power > powerAt(440 * 2 ** ((other - 69) / 12), time) * 3,
        `Pitch ${midi} should dominate at ${time}s`
      );
  }
  // Compare the encoded frame at t=1s with that exact state in the shared renderer.
  const reference = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await reference.goto(`${base}/render.html`);
  await reference.waitForFunction(() => !!window.doregoRenderer);
  await reference.evaluate(
    (spec) => {
      window.doregoRenderer.init(spec, 1280, 720);
      window.doregoRenderer.frame(1);
    },
    short as typeof DEFAULT_SPEC
  );
  const referencePath = new URL('video-reference.png', work).pathname;
  await reference.locator('canvas').screenshot({ path: referencePath });
  await reference.close();
  const framePath = new URL('video-frame.png', work).pathname;
  await promisify(execFile)('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    path,
    '-vf',
    'select=eq(n\\,30)',
    '-frames:v',
    '1',
    framePath,
  ]);
  const similarity = await promisify(execFile)('ffmpeg', [
    '-hide_banner',
    '-i',
    framePath,
    '-i',
    referencePath,
    '-lavfi',
    'ssim',
    '-f',
    'null',
    '-',
  ]);
  const score = Number(similarity.stderr.match(/All:([\d.]+)/)?.[1]);
  assert.ok(score > 0.98, `Frame should match t=1s reference, SSIM=${score}`);
  // Input validation and local-origin protections.
  const bad = await page.request.post(`${base}/api/exports`, {
    data: { spec: { ...short, bpm: 0 } },
  });
  assert.equal(bad.status(), 400);
  const crossOrigin = await page.request.post(`${base}/api/exports`, {
    headers: { origin: 'https://example.org' },
    data: { spec: short },
  });
  assert.equal(crossOrigin.status(), 403);
  const cancel = await page.request.post(`${base}/api/exports`, { data: { spec: short } });
  const cancelJob = await cancel.json();
  assert.equal(cancel.status(), 202);
  const concurrent = await page.request.post(`${base}/api/exports`, { data: { spec: short } });
  assert.equal(concurrent.status(), 400);
  const cancelled = await page.request.delete(`${base}/api/exports/${cancelJob.id}`);
  assert.equal((await cancelled.json()).status, 'cancelled');
  const hdStart = await page.request.post(`${base}/api/exports`, {
    data: {
      spec: {
        ...DEFAULT_SPEC,
        pattern: 'major',
        low: 60,
        high: 60,
        countIn: 0,
        repetitions: 1,
        noteBeats: 0.25,
        bpm: 240,
      },
      height: 1080,
    },
  });
  assert.equal(hdStart.status(), 202);
  const hdJob = await hdStart.json();
  const deadline = Date.now() + 90000;
  let hdStatus = hdJob.status;
  while (hdStatus !== 'complete' && Date.now() < deadline) {
    await page.waitForTimeout(500);
    const result = await (await page.request.get(`${base}/api/exports/${hdJob.id}`)).json();
    assert.notEqual(result.status, 'failed', result.error);
    hdStatus = result.status;
  }
  assert.equal(hdStatus, 'complete');
  const hdFile = new URL('exercise-1080.mp4', work).pathname;
  const hdResponse = await page.request.get(`${base}/api/exports/${hdJob.id}/download`);
  await writeFile(hdFile, await hdResponse.body());
  const hdProbe = JSON.parse(
    (
      await promisify(execFile)('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        hdFile,
      ])
    ).stdout
  );
  assert.deepEqual(hdProbe.streams[0], { width: 1920, height: 1080 });
  assert.deepEqual(errors, []);
  console.log(
    `PASS: desktop/mobile UI, playback, pause/resume, saved exercise, transposition, validation, MIDI, frame-order independence, MP4 with audible audio (RMS ${rms.toFixed(4)}), guide pitch timing, exported frame timing (SSIM ${score.toFixed(4)}), cancellation, and origin protection.`
  );
} finally {
  await browser.close();
}
