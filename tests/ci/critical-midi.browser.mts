// CI's bounded MIDI contract. Exhaustive ranges, devices, offline and recovery
// remain in apps/notewise/tests/midi.browser.ts in Nightly. Do not add loops here.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { launchBrowser, createContext, waitForServer, waitForApp, captureFailure, closeBrowser } from '../../scripts/ci/browser-harness.cjs';
import { selectPractice, midiAction } from '../../packages/music-practice/browser-tests/helpers';
const vite = createRequire(import.meta.url).resolve('vite/package.json').replace(/package.json$/, 'bin/vite.js');
const port = '4334', origin = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  await waitForServer(origin, { server });
  browser = await launchBrowser();
  const context = await createContext(browser, { viewport: { width: 1280, height: 1000 } });
  await context.addInitScript({ content: await readFile(new URL('../../packages/music-practice/test-fixtures/midi.js', import.meta.url), 'utf8') });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await waitForApp(page, '[data-letter="E"]:enabled');
  await selectPractice(page, 'piano');
  assert.equal(await page.evaluate(() => (window as any).midiTest.calls()), 0, 'MIDI permission stays user initiated');
  await midiAction(page, 'Connect MIDI keyboard');
  await expect(page.getByText('GO:KEYS 5 connected. Play one note at a time.', { exact: true })).toBeAttached();
  assert.deepEqual(await page.evaluate(() => (window as any).midiTest.options), [{ sysex: false, software: false }]);
  const send = (data: number[]) => page.evaluate(data => (window as any).midiTest.send(data, 'roland', performance.now()), data);
  await send([0x90, 72, 100]);
  await expect(page.locator('#feedback')).toContainText('You chose C5');
  await expect(page.locator('#counter')).toHaveAttribute('data-answered', '1');
  await page.waitForFunction(() => document.querySelector('[data-piano]')?.getAttribute('aria-disabled') === 'false');
  await send([0x90, 72, 100]);
  await send([0x90, 76, 100]);
  await expect(page.locator('#counter')).toHaveAttribute('data-answered', '1');
  await send([0x90, 72, 0]);
  await send([0x90, 76, 0]);
  await send([0x90, 62, 100]);
  await expect(page.locator('#feedback')).toHaveText('Yes — D4');
  await expect(page.locator('#counter')).toHaveAttribute('data-answered', '2');
  await send([0x90, 62, 0]);
  await page.evaluate(() => (window as any).midiTest.remove('roland'));
  await expect(page.getByText('GO:KEYS 5 connected. Play one note at a time.', { exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('PASS critical MIDI: explicit permission, connection, octave grading, held/chord guard and hotplug');
} catch (error) { if (browser) await captureFailure(browser, error); throw error; }
finally { if (browser) await closeBrowser(browser); server.kill(); }
