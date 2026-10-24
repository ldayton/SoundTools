import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC } from '../src/music';

const port = 4321;
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { stdio: 'pipe' }
);
const browser = await chromium.launch();
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* Wait for Vite. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.evaluate((spec) => localStorage.setItem('dorego.current', JSON.stringify(spec)), {
    ...DEFAULT_SPEC,
    countIn: 0,
    repetitions: 1,
    low: 52,
    high: 64,
  });
  await page.reload();
  for (const [pattern, span, direction] of [
    ['fifthGlide', 7, 'up'],
    ['fifthGlide', 7, 'down'],
    ['fifthGlide', 7, 'both'],
    ['octaveGlide', 12, 'up'],
    ['octaveGlide', 12, 'down'],
    ['octaveGlide', 12, 'both'],
  ] as const) {
    await page.locator('#pattern').selectOption(pattern);
    await page.locator(`input[name="direction"][value="${direction}"]`).check();
    assert.ok(await page.locator('#direction').isVisible());
    assert.equal(await page.locator('#starting-chords-field').getAttribute('hidden'), null);
    await page.waitForFunction(() =>
      document.querySelector('#play')?.textContent?.includes('Play')
    );
    assert.ok(await page.locator('#form-error').isHidden());
    await page.locator('#play').click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.waitForTimeout(3300);
    await page.locator('#play').click();
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    await page.locator('#play').click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.locator('#play').click();
    // Browser-native offline rendering exercises the same sample loader, graph,
    // pitch automation and envelopes as live playback, through the slowest tempo.
    await page.evaluate(
      (spec) => {
        (window as any).glideTestSpec = spec;
      },
      {
        ...DEFAULT_SPEC,
        pattern,
        direction,
        progression: 'up',
        low: 52,
        high: 52 + span,
        bpm: 60,
        countIn: 0,
        repetitions: 1,
        restBeats: 0,
      }
    );
    const result = await page.evaluate<{
      peak: number;
      rms: number;
      maxJump: number;
      lateRms: number;
      finalRms: number;
      pitches: { cents: number; correlation: number }[];
    }>(`(async () => {
      const { generateExercise } = await import('/src/music.ts');
      const { renderAudio } = await import('/src/audio.ts');
      const exercise = generateExercise(window.glideTestSpec);
      const bytes = await renderAudio(exercise);
      const data = new DataView(bytes.buffer);
      const rate = data.getUint32(24, true), channels = data.getUint16(22, true);
      const frames = (bytes.length - 44) / channels / 2;
      const sample = i => data.getInt16(44 + i * channels * 2, true) / 32768;
      let peak = 0, energy = 0, maxJump = 0;
      for (let i = 0; i < frames; i++) {
        const v = sample(i); peak = Math.max(peak, Math.abs(v)); energy += v * v;
        if (i) maxJump = Math.max(maxJump, Math.abs(v - sample(i - 1)));
      }
      const rmsAt = time => {
        let e = 0; for (let i = 0; i < 4096; i++) e += sample(Math.floor(time * rate) + i) ** 2;
        return Math.sqrt(e / 4096);
      };
      const pitchAt = (time, expected) => {
        const offset = Math.floor(time * rate); let best = 0, lagBest = 0;
        for (let lag = Math.floor(rate / expected / 1.08); lag <= Math.ceil(rate / expected / .92); lag++) {
          let dot = 0, a = 0, b = 0;
          for (let i = 0; i < 4096; i++) { const x = sample(offset + i), y = sample(offset + i + lag); dot += x * y; a += x * x; b += y * y; }
          const c = dot / Math.sqrt(a * b); if (c > best) { best = c; lagBest = lag; }
        }
        return { cents: 1200 * Math.log2(rate / lagBest / expected), correlation: best };
      };
      const root = 440 * 2 ** ((exercise.notes.find(n => n.glideSpan).midi - 69) / 12);
      const glide = exercise.notes.find(n => n.glideSpan);
      const span = glide.glideSpan;
      const end = exercise.totalBeats;
      const pitches = [pitchAt(6.5, root), pitchAt(12.5, root * 2 ** (span / 12)), pitchAt(end - .7, root * 2 ** ((glide.glideReturns ? 0 : span) / 12))];
      return { peak, rms: Math.sqrt(energy / frames), maxJump, pitches, lateRms: rmsAt(end - .7), finalRms: rmsAt(end + .5) };
    })()`);
    assert.ok(result.peak > 0.05 && result.peak < 0.99, JSON.stringify(result));
    assert.ok(
      result.rms > 0.02 && result.lateRms > 0.01,
      'A slow glide must sustain to the last hold'
    );
    assert.ok(result.finalRms < 0.0001, 'The cello must fade to silence');
    assert.ok(result.maxJump < 0.15, JSON.stringify(result));
    for (const p of result.pitches)
      assert.ok(Math.abs(p.cents) < 60 && p.correlation > 0.8, JSON.stringify(result));
    console.log(pattern, direction, JSON.stringify(result));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  assert.equal(await page.locator('#pattern').inputValue(), 'octaveGlide');
  assert.ok(await page.locator('#direction').isVisible());
  assert.ok(await page.locator('#note-range').isVisible());
  assert.ok(await page.locator('#form-error').isHidden());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#play').click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.waitForTimeout(3800);
  await page.screenshot({ path: 'work/glide-mobile.png', fullPage: true });
  await page.locator('#play').click();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: 'work/glide-desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: both glide controls, local persistence, mobile layout, pause/resume, slow continuous audio, pitch endpoints, headroom and fades.'
  );
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
