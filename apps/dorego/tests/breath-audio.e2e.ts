import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { launchTestBrowser, browserName } from './browser-harness';
import { setSlider } from './ui-helpers';
const vite = createRequire(import.meta.url)
  .resolve('vite/package.json')
  .replace(/package.json$/, 'bin/vite.js');
const port = Number(process.env.TEST_PORT || 4361),
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
  await context.addInitScript(() => {
    localStorage.setItem('dorego.exercise', 'breathSquares');
    localStorage.setItem('dorego.breathSquares', JSON.stringify({ rounds: 1, seconds: 1 }));
    const probe = ((window as any).breathAudio = {
      contexts: [] as AudioContext[],
      ticks: [] as number[],
      peak: 0,
      blocked: false,
    });
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contexts.push(this);
      }
      resume() {
        return probe.blocked ? Promise.reject(new Error('Test audio blocked')) : super.resume();
      }
    };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (at = 0) {
      if (this.frequency.value === 1400) probe.ticks.push(at);
      return start.call(this, at);
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (args[0] === this.context.destination && this instanceof GainNode) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 256;
        (connect as Function).call(this, analyser);
        const values = new Float32Array(256);
        setInterval(() => {
          if (this.context.state !== 'running') return;
          analyser.getFloatTimeDomainData(values);
          probe.peak = Math.max(probe.peak, ...values.map(Math.abs));
        }, 5);
      }
      return (connect as Function).apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
  const page = await context.newPage(),
    errors: string[] = [],
    samples: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().endsWith('.flac')) samples.push(request.url());
  });
  await page.goto(base);
  await page.locator('#breath-play').click();
  await page.getByRole('button', { name: 'Replay', exact: true }).waitFor({ timeout: 10000 });
  await page.waitForFunction(() => (window as any).breathAudio.peak > 0.001);
  const ticks: number[] = await page.evaluate(() => (window as any).breathAudio.ticks);
  assert.equal(ticks.length, 5, 'Start, three intermediate seconds, and the final boundary');
  for (let i = 1; i < ticks.length; i++)
    assert.ok(Math.abs(ticks[i] - ticks[i - 1] - 1) < 0.08, `Second ${i} is evenly scheduled`);
  assert.deepEqual(samples, [], 'Breathing ticks never need piano recordings');
  await page.locator('#breath-restart').click();
  await setSlider(page, 'volume', 0);
  await page.evaluate(() => {
    (window as any).breathAudio.peak = 0;
  });
  await page.locator('#breath-play').click();
  await page.waitForFunction(() => (window as any).breathAudio.ticks.length >= 7);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  assert.ok(
    await page.evaluate(() => (window as any).breathAudio.peak < 0.00001),
    'Volume zero silences the actual tick signal'
  );
  const pausedTicks = await page.evaluate(() => (window as any).breathAudio.ticks.length);
  await page.waitForTimeout(1200);
  assert.equal(
    await page.evaluate(() => (window as any).breathAudio.ticks.length),
    pausedTicks,
    'Paused exercise schedules no ticks'
  );
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.evaluate(async () => {
    await (window as any).breathAudio.contexts.at(-1).suspend();
  });
  await page.getByRole('alert').filter({ visible: true }).waitFor();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await page.evaluate(() => {
    (window as any).breathAudio.blocked = true;
  });
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await page.evaluate(() => {
    (window as any).breathAudio.blocked = false;
  });
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() => (window as any).breathAudio.contexts.at(-1).state === 'running');
  assert.equal(await page.getByRole('alert').filter({ visible: true }).count(), 0);
  await page.locator('#breath-restart').click();
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${browserName}: evenly spaced real audio ticks, actual signal, mute, pause cancellation, audio interruption and rejected-start recovery`
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
