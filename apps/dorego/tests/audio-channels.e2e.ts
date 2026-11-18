import { captureFailure, closeBrowser, createContext } from '../../../scripts/ci/browser-harness.cjs';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchTestBrowser, browserName } from './browser-harness';
import { openPractice, openSettings } from './ui-helpers';

const server = await createServer({ server: { host: '127.0.0.1', port: 4367, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await launchTestBrowser({ args: browserName === 'chromium' ? ['--mute-audio'] : [] });
  const context = await createContext(browser, {
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => {
    const probe = ((window as any).channelProbe = { peak: 0, difference: 0, errors: [] as string[] });
    // WebKit's inspector also reports caught aborted fetches as page errors.
    // Observe actual uncaught script errors and rejections, as in the pages suite.
    window.addEventListener('error', event => probe.errors.push(event.message));
    window.addEventListener('unhandledrejection', event => probe.errors.push(String(event.reason)));
    const connect: Function = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (args[0] === this.context.destination && !(this.context instanceof OfflineAudioContext)) {
        const split = this.context.createChannelSplitter(2);
        const left = this.context.createAnalyser(),
          right = this.context.createAnalyser();
        left.fftSize = right.fftSize = 256;
        const mute = this.context.createGain();
        mute.gain.value = 0;
        connect.call(split, left, 0);
        connect.call(split, right, 1);
        connect.call(left, mute);
        connect.call(right, mute);
        connect.call(mute, this.context.destination);
        const l = new Float32Array(256),
          r = new Float32Array(256);
        setInterval(() => {
          left.getFloatTimeDomainData(l);
          right.getFloatTimeDomainData(r);
          for (let i = 0; i < l.length; i++) {
            probe.peak = Math.max(probe.peak, Math.abs(l[i]), Math.abs(r[i]));
            probe.difference = Math.max(probe.difference, Math.abs(l[i] - r[i]));
          }
        }, 5);
        return connect.call(this, split);
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4367/#settings');
  const output = page.getByRole('combobox', { name: 'Output', exact: true });
  assert.equal(await output.inputValue(), 'Stereo');
  assert.equal(await page.getByText('Left-channel mono', { exact: true }).count(), 0);
  await output.click();
  await page.getByRole('option', { name: 'Combined mono', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('dorego.audioChannels')), 'mono');
  await page.reload();
  assert.equal(await output.inputValue(), 'Combined mono');

  // Verify the actual Web Audio speakers matrix, including cancellation, at both device rates.
  const matrices = await page.evaluate(async () => {
    const path: string = '/src/audio-channels.ts';
    const { configureChannelMix } = await import(path);
    const results = [];
    for (const rate of [44100, 48000])
      for (const mode of ['stereo', 'mono'] as const) {
        const context = new OfflineAudioContext(2, 128, rate);
        const buffer = context.createBuffer(2, 128, rate);
        buffer.getChannelData(0).fill(0.6);
        buffer.getChannelData(1).fill(-0.2);
        const source = context.createBufferSource();
        source.buffer = buffer;
        const mix = context.createGain();
        configureChannelMix(mix, mode);
        source.connect(mix).connect(context.destination);
        source.start();
        const rendered = await context.startRendering();
        results.push({
          rate,
          mode,
          left: rendered.getChannelData(0)[64],
          right: rendered.getChannelData(1)[64],
        });
      }
    return results;
  });
  for (const row of matrices) {
    assert.ok(Math.abs(row.left - (row.mode === 'mono' ? 0.2 : 0.6)) < 1e-6);
    assert.ok(Math.abs(row.right - (row.mode === 'mono' ? 0.2 : -0.2)) < 1e-6);
  }

  for (const mode of ['mono', 'stereo'] as const) {
    if (mode === 'stereo') {
      await openSettings(page);
      await page.waitForTimeout(300);
      await output.click();
      await page.getByRole('option', { name: 'Stereo', exact: true }).click();
    }
    await openPractice(page);
    await page.locator('#play:enabled').waitFor();
    // Wait for any release tail and analyser window from the previous audition.
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      (window as any).channelProbe.peak = 0;
      (window as any).channelProbe.difference = 0;
    });
    await page.locator('#play').click();
    await page.waitForFunction(() => (window as any).channelProbe.peak > 0.001);
    if (mode === 'stereo')
      await page.waitForFunction(() => (window as any).channelProbe.difference > 0.001);
    else assert.ok((await page.evaluate(() => (window as any).channelProbe.difference)) < 1e-6);
    await openSettings(page);
    await page.waitForTimeout(300);
    await openPractice(page);
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      (window as any).channelProbe.peak = 0;
      (window as any).channelProbe.difference = 0;
    });
    const key = page.locator('.piano-key').first();
    await key.click();
    await page.waitForFunction(() => (window as any).channelProbe.peak > 0.001);
    if (mode === 'stereo')
      await page.waitForFunction(() => (window as any).channelProbe.difference > 0.001);
    else assert.ok((await page.evaluate(() => (window as any).channelProbe.difference)) < 1e-6);
  }
  await openSettings(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await output.waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'work/audio-channels-mobile.png', fullPage: true });
  assert.deepEqual(await page.evaluate(() => (window as any).channelProbe.errors), []);
  console.log(
    `${browserName}: persisted settings, stereo/mono exercise and reference audio, matrix at 44.1/48 kHz, mobile layout passed`
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  await server.close();
}
