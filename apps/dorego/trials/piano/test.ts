import { createContext } from "../../../../scripts/ci/browser-harness.cjs";
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchTestBrowser, browserName } from '../../tests/browser-harness';
import { comparisonGains, type Manifest } from './player';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, '../../work/piano-trial');
const manifest: Manifest = JSON.parse(readFileSync(resolve(output, 'manifest.json'), 'utf8'));
for (const clip of manifest.clips) {
  for (const match of [true, false]) {
    const gains = comparisonGains(clip, match);
    const levels = Object.entries(clip.variants).map(([key, v]) => {
      const gain = gains[key as keyof typeof gains];
      assert.ok(v.peak * gain <= 0.800001);
      return v.rms * gain;
    });
    if (match) assert.ok(Math.max(...levels) - Math.min(...levels) < 1e-12);
  }
}
const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  server: { port: 4366 },
});
await server.listen();
const base = 'http://127.0.0.1:4366';
const results: unknown[] = [];
try {
  assert.equal((await fetch(`${base}/audio/not-a-file.flac`)).status, 404);
  assert.equal((await fetch(`${base}/manifest.json`)).headers.get('cache-control'), 'no-store');
  for (const name of [browserName]) {
    const browser = await launchTestBrowser({ args: name === 'chromium' ? ['--mute-audio'] : [] });
    try {
      const context = await createContext(browser, {
        viewport: { width: 1680, height: 1050 },
        serviceWorkers: 'block',
      });
      await context.addInitScript(() => {
        const w = window as any;
        w.probe = { starts: [], peak: 0 };
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
          w.probe.starts.push({
            channels: this.buffer?.numberOfChannels,
            rate: this.context.sampleRate,
          });
          return start.apply(this, args);
        };
        const connect: Function = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
          if (args[0] === this.context.destination && this instanceof GainNode) {
            const analyser = this.context.createAnalyser();
            const silent = this.context.createGain();
            silent.gain.value = 0;
            connect.call(analyser, silent);
            connect.call(silent, this.context.destination);
            const values = new Float32Array(analyser.fftSize);
            setInterval(() => {
              analyser.getFloatTimeDomainData(values);
              w.probe.peak = Math.max(w.probe.peak, ...values.map(Math.abs));
            }, 10);
            return connect.call(this, analyser);
          }
          return (connect as Function).apply(this, args);
        } as typeof AudioNode.prototype.connect;
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base);
      await page.getByRole('button', { name: 'Play Original stereo', exact: true }).waitFor();
      for (const label of [
        'Original stereo',
        'Combined mono',
        'Left-channel mono',
        'Right-channel mono',
      ]) {
        await page.getByRole('button', { name: `Play ${label}`, exact: true }).click();
        await page.waitForFunction(() => (window as any).probe.peak > 0.0001);
        await page.getByRole('button', { name: `Play ${label}`, exact: true }).waitFor();
      }
      assert.deepEqual(
        await page.evaluate(() => (window as any).probe.starts.map((s: any) => s.channels)),
        [2, 1, 1, 1]
      );
      // Mute is applied before the first sample, not after an audible transient.
      await page.reload();
      await page.getByRole('slider', { name: 'Volume', exact: true }).focus();
      await page.keyboard.press('Home');
      assert.equal(
        await page
          .getByRole('slider', { name: 'Volume', exact: true })
          .getAttribute('aria-valuenow'),
        '0'
      );
      await page.evaluate(() => {
        (window as any).probe.peak = 0;
      });
      await page.getByRole('button', { name: 'Play Original stereo', exact: true }).click();
      await page.getByRole('button', { name: 'Play Original stereo', exact: true }).waitFor();
      assert.ok((await page.evaluate(() => (window as any).probe.peak)) < 1e-6);
      // A cancelled cold download must never start playback later.
      await page.reload();
      let release!: () => void;
      const held = new Promise<void>((r) => {
        release = r;
      });
      let requested!: () => void;
      const request = new Promise<void>((r) => {
        requested = r;
      });
      await page.route('**/audio/*-left.flac', async (route) => {
        requested();
        await held;
        await route.continue();
      });
      await page.getByRole('button', { name: 'Play Left-channel mono', exact: true }).click();
      await request;
      await page.getByRole('button', { name: 'Stop Left-channel mono', exact: true }).click();
      release();
      await page.getByRole('button', { name: 'Play Right-channel mono', exact: true }).click();
      await page.getByRole('button', { name: 'Play Right-channel mono', exact: true }).waitFor();
      assert.deepEqual(
        await page.evaluate(() => (window as any).probe.starts.map((s: any) => s.channels)),
        [1]
      );
      // A failed request can be retried, rather than poisoning the buffer cache.
      await page.route('**/audio/*-sum.flac', (route) =>
        route.fulfill({ status: 503, body: 'Unavailable' })
      );
      await page.getByRole('button', { name: 'Play Combined mono', exact: true }).click();
      await page.getByRole('alert').waitFor();
      await page.unroute('**/audio/*-sum.flac');
      await page.getByRole('button', { name: 'Play Combined mono', exact: true }).click();
      await page.getByRole('button', { name: 'Play Combined mono', exact: true }).waitFor();
      assert.equal(await page.getByRole('alert').count(), 0);
      await page.getByLabel('Three-note phrase', { exact: true }).check();
      const before = await page.evaluate(() => (window as any).probe.starts.length);
      await page.getByRole('button', { name: 'Play Combined mono', exact: true }).click();
      await page.getByRole('button', { name: 'Play Combined mono', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => (window as any).probe.starts.length), before + 3);

      const decode = await page.evaluate(async () => {
        const manifest = await (await fetch('/manifest.json')).json();
        const clip = manifest.clips.find((c: any) => c.midi === 75 && c.layer === 12);
        const rows = [];
        for (const rate of [44100, 48000]) {
          for (const [profile, v] of Object.entries(clip.variants) as [string, any][]) {
            const offline = new OfflineAudioContext(2, rate * 2, rate);
            const buffer = await offline.decodeAudioData(await (await fetch(v.url)).arrayBuffer());
            const source = offline.createBufferSource();
            source.buffer = buffer;
            source.connect(offline.destination);
            source.start();
            const render = await offline.startRendering();
            let peak = 0,
              difference = 0;
            for (let i = 0; i < render.length; i++) {
              peak = Math.max(
                peak,
                Math.abs(render.getChannelData(0)[i]),
                Math.abs(render.getChannelData(1)[i])
              );
              difference = Math.max(
                difference,
                Math.abs(render.getChannelData(0)[i] - render.getChannelData(1)[i])
              );
            }
            rows.push({
              profile,
              rate,
              frames: buffer.length,
              channels: buffer.numberOfChannels,
              peak,
              difference,
            });
          }
        }
        return rows;
      });
      for (const row of decode) {
        assert.ok(Math.abs(row.frames - row.rate * 2) <= 1);
        assert.equal(row.channels, row.profile === 'stereo' ? 2 : 1);
        assert.ok(row.peak < 1);
        if (row.profile !== 'stereo') assert.equal(row.difference, 0);
      }
      for (const width of [320, 390, 1680]) {
        await page.setViewportSize({ width, height: 1050 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      mkdirSync(output, { recursive: true });
      if (name === 'chromium') {
        await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
      }
      assert.deepEqual(errors, []);
      results.push({ browser: name, decode, status: 'passed' });
      console.log(
        `${name}: playback, cancellation, retry, mute, phrase, 44.1/48 kHz decoding and layouts passed`
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
console.log(JSON.stringify(results, null, 2));
